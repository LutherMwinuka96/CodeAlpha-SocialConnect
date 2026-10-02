from django.conf import settings
from django.db import models

from apps.core.validators import safe_image_path, validate_image_file


class Post(models.Model):
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="posts")
    text = models.CharField(max_length=500)
    image = models.ImageField(upload_to=safe_image_path, validators=[validate_image_file], blank=True)
    edited = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("author", "-created_at"), name="post_author_created_idx")]

    def __str__(self):
        return f"{self.author.username}: {self.text[:48]}"


class Hashtag(models.Model):
    name = models.SlugField(max_length=80, unique=True)
    posts = models.ManyToManyField(Post, through="PostHashtag", related_name="hashtags")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"#{self.name}"


class PostHashtag(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="post_hashtags")
    hashtag = models.ForeignKey(Hashtag, on_delete=models.CASCADE, related_name="post_hashtags")

    class Meta:
        constraints = [models.UniqueConstraint(fields=("post", "hashtag"), name="unique_post_hashtag")]

