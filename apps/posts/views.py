from django.db.models import BooleanField, Count, Exists, OuterRef, Q, Value
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema

from apps.core.pagination import StandardPagination
from apps.core.permissions import IsOwnerOrReadOnly
from apps.core.utils import notify
from apps.notifications.models import Notification
from apps.social.models import Bookmark, Comment, CommentLike, Follow, PostLike
from .models import Hashtag, Post
from .serializers import CommentSerializer, PostSerializer, MENTION_RE


def post_queryset(user=None):
    qs = Post.objects.select_related("author", "author__profile").prefetch_related("hashtags").annotate(
        likes_count=Count("likes", distinct=True), comments_count=Count("comments", distinct=True)
    )
    if user and user.is_authenticated:
        qs = qs.annotate(
            viewer_liked=Exists(PostLike.objects.filter(post_id=OuterRef("pk"), user=user)),
            viewer_bookmarked=Exists(Bookmark.objects.filter(post_id=OuterRef("pk"), user=user)),
            viewer_follows_author=Exists(Follow.objects.filter(follower=user, following_id=OuterRef("author_id"))),
            author_follows_viewer=Exists(Follow.objects.filter(follower_id=OuterRef("author_id"), following=user)),
        )
    return qs


class PostViewSet(viewsets.ModelViewSet):
    serializer_class = PostSerializer
    permission_classes = [IsAuthenticatedOrReadOnly, IsOwnerOrReadOnly]
    pagination_class = StandardPagination

    def get_queryset(self):
        return post_queryset(self.request.user)

    def perform_destroy(self, instance):
        if instance.author_id != self.request.user.pk:
            raise PermissionDenied("You can delete only your own posts.")
        instance.delete()

    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated])
    def feed(self, request):
        followed_ids = Follow.objects.filter(follower=request.user).values("following_id")
        queryset = self.get_queryset().filter(Q(author=request.user) | Q(author_id__in=followed_ids))
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    @action(detail=False, methods=["get"], permission_classes=[AllowAny])
    def explore(self, request):
        queryset = self.get_queryset().order_by("-likes_count", "-created_at")
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated])
    def saved(self, request):
        queryset = self.get_queryset().filter(bookmarks__user=request.user)
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated])
    def by_hashtag(self, request):
        tag = request.query_params.get("tag", "").lstrip("#").casefold()
        queryset = self.get_queryset().filter(hashtags__name=tag) if tag else self.get_queryset().none()
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated])
    def trending(self, request):
        tags = Hashtag.objects.annotate(post_count=Count("posts", distinct=True)).filter(post_count__gt=0).order_by("-post_count", "name")[:20]
        return Response([{"name": tag.name, "posts_count": tag.post_count} for tag in tags])

    @action(detail=True, methods=["post", "delete"], permission_classes=[IsAuthenticated])
    def like(self, request, pk=None):
        post = self.get_object()
        if request.method == "POST":
            _, created = PostLike.objects.get_or_create(user=request.user, post=post)
            if created:
                notify(post.author, request.user, Notification.LIKE, post=post)
            return Response({"liked": True, "likes_count": post.likes.count()})
        PostLike.objects.filter(user=request.user, post=post).delete()
        return Response({"liked": False, "likes_count": post.likes.count()})

    @action(detail=True, methods=["post", "delete"], permission_classes=[IsAuthenticated])
    def bookmark(self, request, pk=None):
        post = self.get_object()
        if request.method == "POST":
            Bookmark.objects.get_or_create(user=request.user, post=post)
            return Response({"bookmarked": True})
        Bookmark.objects.filter(user=request.user, post=post).delete()
        return Response({"bookmarked": False})

    @action(detail=True, methods=["get", "post"], permission_classes=[IsAuthenticatedOrReadOnly], url_path="comments")
    def comments(self, request, pk=None):
        post = self.get_object()
        if request.method == "GET":
            queryset = Comment.objects.filter(post=post).select_related("author", "author__profile").annotate(
                likes_count=Count("likes", distinct=True),
                viewer_liked=Exists(CommentLike.objects.filter(comment_id=OuterRef("pk"), user=request.user)) if request.user.is_authenticated else Value(False, output_field=BooleanField()),
            ).order_by("created_at")
            page = self.paginate_queryset(queryset)
            return self.get_paginated_response(CommentSerializer(page, many=True, context={"request": request}).data)
        serializer = CommentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        comment = Comment.objects.create(post=post, author=request.user, text=serializer.validated_data["text"])
        notify(post.author, request.user, Notification.COMMENT, post=post, comment=comment)
        for username in set(MENTION_RE.findall(comment.text)):
            from django.contrib.auth import get_user_model
            mentioned = get_user_model().objects.filter(username__iexact=username).first()
            if mentioned:
                notify(mentioned, request.user, Notification.MENTION, post=post, comment=comment)
        comment.likes_count = 0
        return Response(CommentSerializer(comment, context={"request": request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch", "delete"], permission_classes=[IsAuthenticated], url_path=r"comments/(?P<comment_pk>[^/.]+)")
    def comment_detail(self, request, pk=None, comment_pk=None):
        post = self.get_object()
        comment = get_object_or_404(Comment.objects.select_related("author"), pk=comment_pk, post=post)
        if request.method == "DELETE":
            if comment.author_id != request.user.pk and post.author_id != request.user.pk:
                raise PermissionDenied("Only the comment author or post author can delete this comment.")
            comment.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        if comment.author_id != request.user.pk:
            raise PermissionDenied("You can edit only your own comments.")
        serializer = CommentSerializer(comment, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        comment.text = serializer.validated_data.get("text", comment.text)
        comment.edited = True
        comment.save(update_fields=("text", "edited", "updated_at"))
        comment.likes_count = comment.likes.count()
        return Response(CommentSerializer(comment, context={"request": request}).data)

    @action(detail=True, methods=["post", "delete"], permission_classes=[IsAuthenticated], url_path=r"comments/(?P<comment_pk>[^/.]+)/like")
    def comment_like(self, request, pk=None, comment_pk=None):
        post = self.get_object()
        comment = get_object_or_404(Comment, pk=comment_pk, post=post)
        if request.method == "POST":
            _, created = CommentLike.objects.get_or_create(user=request.user, comment=comment)
            if created:
                notify(comment.author, request.user, Notification.LIKE, post=post, comment=comment)
        else:
            CommentLike.objects.filter(user=request.user, comment=comment).delete()
        return Response({"liked": request.method == "POST", "likes_count": comment.likes.count()})


class SearchViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    @extend_schema(parameters=[OpenApiParameter("q", str, required=False)], responses=OpenApiTypes.OBJECT)
    def list(self, request):
        query = request.query_params.get("q", "").strip()[:120]
        if not query:
            return Response({"people": [], "posts": [], "hashtags": []})
        from django.contrib.auth import get_user_model
        from apps.accounts.serializers import UserSerializer
        from apps.accounts.views import visible_users
        users = visible_users(request.user).filter(Q(username__icontains=query) | Q(full_name__icontains=query)).order_by("username")[:10]
        posts = post_queryset(request.user).filter(Q(text__icontains=query) | Q(hashtags__name__icontains=query.lstrip("#"))).distinct()[:10]
        hashtags = Hashtag.objects.filter(name__icontains=query.lstrip("#")).annotate(post_count=Count("posts", distinct=True)).order_by("-post_count")[:10]
        return Response({
            "people": UserSerializer(users, many=True, context={"request": request}).data,
            "posts": PostSerializer(posts, many=True, context={"request": request}).data,
            "hashtags": [{"name": tag.name, "posts_count": tag.post_count} for tag in hashtags],
        })
