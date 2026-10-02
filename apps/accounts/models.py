from django.contrib.auth.models import AbstractUser
from django.db import models

from apps.core.validators import safe_image_path, validate_image_file


class User(AbstractUser):
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=120, blank=True)
    theme = models.CharField(max_length=8, choices=(("light", "Light"), ("dark", "Dark"), ("system", "System")), default="system")

    def __str__(self):
        return self.full_name or self.username


class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    avatar = models.ImageField(upload_to=safe_image_path, validators=[validate_image_file], blank=True)
    cover = models.ImageField(upload_to=safe_image_path, validators=[validate_image_file], blank=True)
    bio = models.CharField(max_length=160, blank=True)
    location = models.CharField(max_length=100, blank=True)
    website = models.URLField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Profile of {self.user.username}"
