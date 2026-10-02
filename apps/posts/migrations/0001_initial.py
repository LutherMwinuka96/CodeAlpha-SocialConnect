import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import apps.core.validators


class Migration(migrations.Migration):
    initial = True
    dependencies = [("accounts", "0001_initial")]
    operations = [
        migrations.CreateModel(
            name="Hashtag",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.SlugField(max_length=80, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.CreateModel(
            name="Post",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("text", models.CharField(max_length=500)),
                ("image", models.ImageField(blank=True, upload_to=apps.core.validators.safe_image_path, validators=[apps.core.validators.validate_image_file])),
                ("edited", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("author", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="posts", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("-created_at",)},
        ),
        migrations.CreateModel(
            name="PostHashtag",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("hashtag", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="post_hashtags", to="posts.hashtag")),
                ("post", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="post_hashtags", to="posts.post")),
            ],
        ),
        migrations.AddField(model_name="hashtag", name="posts", field=models.ManyToManyField(related_name="hashtags", through="posts.PostHashtag", to="posts.post")),
        migrations.AddConstraint(model_name="posthashtag", constraint=models.UniqueConstraint(fields=("post", "hashtag"), name="unique_post_hashtag")),
        migrations.AddIndex(model_name="post", index=models.Index(fields=["author", "-created_at"], name="post_author_created_idx")),
    ]
