import re

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.posts.models import Hashtag, Post, PostHashtag
from apps.social.models import Bookmark, Comment, CommentLike, Follow, PostLike

User = get_user_model()
DEMO_PASSWORD = "ConnectDemo!2026_River"


class Command(BaseCommand):
    help = "Create an idempotent set of demo users and social content."

    @transaction.atomic
    def handle(self, *args, **options):
        people = [
            ("maya", "Maya Wanjiku", "Designing small things with a little more care. Nairobi, Kenya."),
            ("sam", "Sam Otieno", "Books, good coffee, and the occasional long walk."),
            ("amina", "Amina Hassan", "Building community through stories and shared ideas."),
            ("leo", "Leo Kimani", "Photographs of places that make me pause."),
        ]
        users = {}
        for username, name, bio in people:
            user = User.objects.filter(username=username).first()
            if user is None:
                user = User.objects.create_user(username=username, email=f"{username}@demo.codealpha.local", full_name=name, password=DEMO_PASSWORD)
                self.stdout.write(f"Created demo account: {username}")
            else:
                changed = []
                if user.full_name != name:
                    user.full_name = name
                    changed.append("full_name")
                if not user.is_active:
                    user.is_active = True
                    changed.append("is_active")
                if changed:
                    user.save(update_fields=changed)
            profile = user.profile
            if not profile.bio:
                profile.bio = bio
                profile.location = "Nairobi, Kenya"
                profile.save(update_fields=("bio", "location", "updated_at"))
            users[username] = user

        post_specs = [
            ("maya", "A reminder I keep coming back to: the most useful design is the kind that makes someone feel welcome. #design #community"),
            ("sam", "Sunday plan: a new book, a long walk, and absolutely no rush to be anywhere. What are you reading? #weekend"),
            ("amina", "A good community is built in the small moments: remembering a name, making room, asking one more question. #community"),
            ("leo", "Morning light over the city makes ordinary streets feel like somewhere new. #photography #nairobi"),
            ("maya", "Sharing a few notes from this week’s sketchbook. The first idea is rarely the one that stays. #design"),
            ("sam", "Finished a book that made me slow down. I’m collecting recommendations for what to read next. #books"),
            ("amina", "A question for the timeline: what is one small thing that made your day better? #goodthings"),
            ("leo", "Taking the quiet route home today. #nairobi #photography"),
            ("maya", "Working on a space that feels calm without feeling empty. Progress is a lot of tiny decisions. #design"),
            ("amina", "Thank you to everyone who makes a conversation feel like a place you can return to. #community"),
            ("sam", "Coffee shop notebook page: a list of places to visit and people to catch up with. #weekend"),
            ("leo", "The sky kept changing, so I stayed a little longer. #photography"),
        ]
        posts = []
        for username, text in post_specs:
            post, _ = Post.objects.get_or_create(author=users[username], text=text)
            posts.append(post)
            for tag in set(re.findall(r"(?<!\w)#([\w]{1,80})", text)):
                hashtag, _ = Hashtag.objects.get_or_create(name=tag.casefold())
                PostHashtag.objects.get_or_create(post=post, hashtag=hashtag)

        follow_specs = (("maya", "sam"), ("maya", "amina"), ("sam", "leo"), ("amina", "maya"), ("leo", "maya"), ("leo", "amina"))
        for follower, following in follow_specs:
            Follow.objects.get_or_create(follower=users[follower], following=users[following])

        comment_specs = [
            (0, "sam", "I love this. The welcoming part is what makes good design last."),
            (1, "maya", "I just started a short story collection and it’s perfect for a walk break."),
            (2, "leo", "The small moments really do add up."),
            (3, "amina", "That light has a way of changing the whole morning."),
            (6, "sam", "A proper lunch outside did it for me today."),
            (9, "maya", "Glad to be part of this little corner."),
        ]
        comments = []
        for post_index, username, text in comment_specs:
            comment, _ = Comment.objects.get_or_create(post=posts[post_index], author=users[username], text=text)
            comments.append(comment)
        for username, post_index in (("maya", 1), ("amina", 0), ("leo", 2), ("sam", 3), ("maya", 6), ("leo", 9)):
            PostLike.objects.get_or_create(user=users[username], post=posts[post_index])
        for username, index in (("maya", 0), ("amina", 1), ("leo", 2)):
            CommentLike.objects.get_or_create(user=users[username], comment=comments[index])
        Bookmark.objects.get_or_create(user=users["maya"], post=posts[3])
        Bookmark.objects.get_or_create(user=users["sam"], post=posts[0])

        self.stdout.write(self.style.SUCCESS("Demo data is ready (rerunning this command is safe)."))
        self.stdout.write(f"Demo password for newly created users: {DEMO_PASSWORD}")
