import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.db.models import F, Q


class Migration(migrations.Migration):
    initial = True
    dependencies = [("accounts", "0001_initial"), ("posts", "0001_initial")]
    operations = [
        migrations.CreateModel(
            name="Comment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("text", models.CharField(max_length=500)),
                ("edited", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("author", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="comments", to=settings.AUTH_USER_MODEL)),
                ("post", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="comments", to="posts.post")),
            ],
            options={"ordering": ("created_at",)},
        ),
        migrations.CreateModel(
            name="Follow",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("follower", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="following_links", to=settings.AUTH_USER_MODEL)),
                ("following", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="follower_links", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name="PostLike",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("post", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="likes", to="posts.post")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="post_likes", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name="CommentLike",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("comment", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="likes", to="social.comment")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="comment_likes", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name="Bookmark",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("post", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="bookmarks", to="posts.post")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="bookmarks", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("-created_at",)},
        ),
        migrations.AddIndex(model_name="comment", index=models.Index(fields=["post", "created_at"], name="comment_post_created_idx")),
        migrations.AddConstraint(model_name="follow", constraint=models.UniqueConstraint(fields=("follower", "following"), name="unique_follow_pair")),
        migrations.AddConstraint(model_name="follow", constraint=models.CheckConstraint(condition=~Q(follower=F("following")), name="follow_no_self")),
        migrations.AddIndex(model_name="follow", index=models.Index(fields=["follower", "created_at"], name="follow_follower_created_idx")),
        migrations.AddIndex(model_name="follow", index=models.Index(fields=["following", "created_at"], name="follow_following_created_idx")),
        migrations.AddConstraint(model_name="postlike", constraint=models.UniqueConstraint(fields=("user", "post"), name="unique_post_like")),
        migrations.AddIndex(model_name="postlike", index=models.Index(fields=["post", "created_at"], name="postlike_post_created_idx")),
        migrations.AddConstraint(model_name="commentlike", constraint=models.UniqueConstraint(fields=("user", "comment"), name="unique_comment_like")),
        migrations.AddConstraint(model_name="bookmark", constraint=models.UniqueConstraint(fields=("user", "post"), name="unique_bookmark")),
    ]
