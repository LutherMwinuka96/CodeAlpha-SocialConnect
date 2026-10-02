from django.contrib import admin

from .models import Bookmark, Comment, CommentLike, Follow, PostLike


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ("id", "author", "post", "text_preview", "edited", "created_at")
    list_filter = ("edited", "created_at")
    search_fields = ("text", "author__username", "post__text")
    date_hierarchy = "created_at"
    readonly_fields = ("created_at", "updated_at")

    @admin.display(description="Text")
    def text_preview(self, obj):
        return obj.text[:80]


@admin.register(Follow)
class FollowAdmin(admin.ModelAdmin):
    list_display = ("follower", "following", "created_at")
    search_fields = ("follower__username", "following__username")
    date_hierarchy = "created_at"
    readonly_fields = ("created_at",)


@admin.register(PostLike)
class PostLikeAdmin(admin.ModelAdmin):
    list_display = ("user", "post", "created_at")
    search_fields = ("user__username", "post__text")
    date_hierarchy = "created_at"
    readonly_fields = ("created_at",)


@admin.register(CommentLike)
class CommentLikeAdmin(admin.ModelAdmin):
    list_display = ("user", "comment", "created_at")
    search_fields = ("user__username", "comment__text")
    date_hierarchy = "created_at"
    readonly_fields = ("created_at",)


@admin.register(Bookmark)
class BookmarkAdmin(admin.ModelAdmin):
    list_display = ("user", "post", "created_at")
    search_fields = ("user__username", "post__text")
    date_hierarchy = "created_at"
    readonly_fields = ("created_at",)
