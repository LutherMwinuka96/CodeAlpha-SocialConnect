from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.posts.models import Post
from .models import Follow, PostLike


User = get_user_model()


class SocialApiTests(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username="alice", email="alice@example.com", password="Mango!River!91Blue")
        self.bob = User.objects.create_user(username="bob", email="bob@example.com", password="Mango!River!91Blue")
        self.carol = User.objects.create_user(username="carol", email="carol@example.com", password="Mango!River!91Blue")
        self.post = Post.objects.create(author=self.bob, text="Hello, Connect")
        self.client = APIClient()

    def test_repeated_post_like_does_not_duplicate_or_inflate_count(self):
        self.client.force_authenticate(self.alice)
        path = f"/api/v1/posts/{self.post.pk}/like/"
        self.assertEqual(self.client.post(path).status_code, 200)
        response = self.client.post(path)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["likes_count"], 1)
        self.assertEqual(PostLike.objects.filter(user=self.alice, post=self.post).count(), 1)

    def test_repeated_follow_does_not_duplicate(self):
        self.client.force_authenticate(self.alice)
        path = "/api/v1/users/bob/follow/"
        self.assertEqual(self.client.post(path).status_code, 204)
        self.assertEqual(self.client.post(path).status_code, 204)
        self.assertEqual(Follow.objects.filter(follower=self.alice, following=self.bob).count(), 1)

    def test_cannot_follow_self(self):
        self.client.force_authenticate(self.alice)
        response = self.client.post("/api/v1/users/alice/follow/")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Follow.objects.filter(follower=self.alice, following=self.alice).exists())

    def test_following_feed_contains_own_and_followed_posts_only(self):
        own_post = Post.objects.create(author=self.alice, text="My own post")
        followed_post = self.post
        unrelated_post = Post.objects.create(author=self.carol, text="Not in Alice's feed")
        Follow.objects.create(follower=self.alice, following=self.bob)
        self.client.force_authenticate(self.alice)
        response = self.client.get("/api/v1/posts/feed/?limit=20")
        self.assertEqual(response.status_code, 200)
        ids = {item["id"] for item in response.data["results"]}
        self.assertIn(own_post.pk, ids)
        self.assertIn(followed_post.pk, ids)
        self.assertNotIn(unrelated_post.pk, ids)

