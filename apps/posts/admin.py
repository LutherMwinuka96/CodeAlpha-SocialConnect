from django.contrib import admin
from django.utils.html import format_html

from apps.social.models import Comment
from .models import Hashtag, Post, PostHashtag


class PostHashtagInline(admin.TabularInline):
    model = PostHashtag
    extra = 0


class CommentInline(admin.TabularInline):
    model = Comment
    extra = 0
    readonly_fields = ("author", "text", "created_at", "updated_at")
    can_delete = False


@admin.action(description="Delete selected posts")
def delete_posts(modeladmin, request, queryset):
    queryset.delete()


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ("id", "author", "text_preview", "image_thumbnail", "edited", "created_at")
    list_filter = ("edited", "created_at")
    search_fields = ("text", "author__username")
    date_hierarchy = "created_at"
    readonly_fields = ("created_at", "updated_at")
    inlines = (PostHashtagInline, CommentInline)
    actions = (delete_posts,)

    @admin.display(description="Text")
    def text_preview(self, obj):
        return obj.text[:80]

    @admin.display(description="Image")
    def image_thumbnail(self, obj):
        return format_html('<img src="{}" alt="" style="width:56px;height:40px;object-fit:cover;border-radius:5px">', obj.image.url) if obj.image else "—"


@admin.register(Hashtag)
class HashtagAdmin(admin.ModelAdmin):
    list_display = ("name", "created_at")
    search_fields = ("name",)
    date_hierarchy = "created_at"
    readonly_fields = ("created_at",)
