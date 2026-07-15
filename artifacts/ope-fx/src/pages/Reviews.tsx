import { useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertCircle, Calendar as CalendarIcon, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  useListReviews,
  useCreateReview,
  useUpdateReview,
  useDeleteReview,
  getListReviewsQueryKey,
  type Review,
  type ReviewInputPeriod,
  type ListReviewsPeriod,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";

function ReviewFormDialog({
  open,
  onOpenChange,
  review,
  defaultPeriod = "weekly",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  review?: Review;
  defaultPeriod?: ReviewInputPeriod;
}) {
  const { toast } = useToast();
  
  const [period, setPeriod] = useState<ReviewInputPeriod>(review?.period ?? defaultPeriod);
  const [title, setTitle] = useState(review?.title ?? "");
  const [content, setContent] = useState(review?.content ?? "");
  const [rating, setRating] = useState<number | "">(review?.rating ?? "");
  const [startDate, setStartDate] = useState(review?.startDate ?? "");
  const [endDate, setEndDate] = useState(review?.endDate ?? "");
  
  const [strengths, setStrengths] = useState(review?.strengths ?? "");
  const [mistakes, setMistakes] = useState(review?.mistakes ?? "");
  const [lessons, setLessons] = useState(review?.lessons ?? "");
  const [actionPlan, setActionPlan] = useState(review?.actionPlan ?? "");

  const createReview = useCreateReview({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListReviewsQueryKey() });
        toast({ title: "Review saved" });
        onOpenChange(false);
      },
      onError: (err) => {
        toast({
          title: "Failed to save review",
          description: err.message,
          variant: "destructive",
        });
      },
    },
  });

  const updateReview = useUpdateReview({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListReviewsQueryKey() });
        toast({ title: "Review updated" });
        onOpenChange(false);
      },
      onError: (err) => {
        toast({
          title: "Failed to update review",
          description: err.message,
          variant: "destructive",
        });
      },
    },
  });

  const isPending = createReview.isPending || updateReview.isPending;

  const handleSave = () => {
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    
    const parsedRating = rating === "" ? undefined : Number(rating);
    if (parsedRating !== undefined && (parsedRating < 1 || parsedRating > 10)) {
      toast({ title: "Rating must be between 1 and 10", variant: "destructive" });
      return;
    }

    const data = {
      period,
      title: title.trim(),
      content: content.trim() || undefined,
      rating: parsedRating,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      strengths: strengths.trim() || undefined,
      mistakes: mistakes.trim() || undefined,
      lessons: lessons.trim() || undefined,
      actionPlan: actionPlan.trim() || undefined,
    };

    if (review) {
      updateReview.mutate({ id: review.id, data });
    } else {
      createReview.mutate({ data });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{review ? "Edit Review" : "New Review"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Period Type</label>
              <div className="flex gap-2">
                {(["daily", "weekly", "monthly"] as ReviewInputPeriod[]).map((p) => (
                  <Button
                    key={p}
                    type="button"
                    variant={period === p ? "default" : "outline"}
                    size="sm"
                    className="flex-1 capitalize"
                    onClick={() => setPeriod(p)}
                  >
                    {p}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Rating (1-10)</label>
              <Input
                type="number"
                min="1"
                max="10"
                value={rating}
                onChange={(e) => setRating(e.target.value ? Number(e.target.value) : "")}
                placeholder="e.g. 8"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Week 14: Staying disciplined"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">End Date</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">General Notes</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Reflections on the period..."
              className="min-h-[100px]"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-emerald-500">Strengths</label>
              <Textarea
                value={strengths}
                onChange={(e) => setStrengths(e.target.value)}
                placeholder="What went well?"
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-destructive">Mistakes</label>
              <Textarea
                value={mistakes}
                onChange={(e) => setMistakes(e.target.value)}
                placeholder="Where did you deviate from your plan?"
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-blue-500">Lessons Learned</label>
              <Textarea
                value={lessons}
                onChange={(e) => setLessons(e.target.value)}
                placeholder="Key takeaways..."
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-purple-500">Action Plan</label>
              <Textarea
                value={actionPlan}
                onChange={(e) => setActionPlan(e.target.value)}
                placeholder="Steps for the next period..."
                className="min-h-[80px]"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : "Save Review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewCard({ review }: { review: Review }) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const { toast } = useToast();

  const deleteReview = useDeleteReview({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListReviewsQueryKey() });
        toast({ title: "Review deleted" });
        setIsDeleteOpen(false);
      },
      onError: (err) => {
        toast({
          title: "Failed to delete review",
          description: err.message,
          variant: "destructive",
        });
      },
    },
  });

  const getRatingColor = (rating: number | null) => {
    if (!rating) return "text-muted-foreground";
    if (rating >= 8) return "text-emerald-500";
    if (rating >= 5) return "text-yellow-500";
    return "text-destructive";
  };

  return (
    <>
      <Card className="hover-elevate">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">{review.period}</Badge>
                {review.rating && (
                  <Badge variant="secondary" className={getRatingColor(review.rating)}>
                    {review.rating}/10
                  </Badge>
                )}
                {(review.startDate || review.endDate) && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <CalendarIcon className="w-3 h-3" />
                    {review.startDate && review.endDate
                      ? `${review.startDate} to ${review.endDate}`
                      : review.startDate || review.endDate}
                  </span>
                )}
              </div>
              <CardTitle className="text-lg">{review.title}</CardTitle>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setIsEditOpen(true)}>
                <Pencil className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setIsDeleteOpen(true)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {review.content && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{review.content}</p>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {review.strengths && (
              <div className="space-y-1">
                <h4 className="text-xs font-semibold text-emerald-500 uppercase tracking-wider">Strengths</h4>
                <p className="text-sm whitespace-pre-wrap">{review.strengths}</p>
              </div>
            )}
            {review.mistakes && (
              <div className="space-y-1">
                <h4 className="text-xs font-semibold text-destructive uppercase tracking-wider">Mistakes</h4>
                <p className="text-sm whitespace-pre-wrap">{review.mistakes}</p>
              </div>
            )}
            {review.lessons && (
              <div className="space-y-1">
                <h4 className="text-xs font-semibold text-blue-500 uppercase tracking-wider">Lessons Learned</h4>
                <p className="text-sm whitespace-pre-wrap">{review.lessons}</p>
              </div>
            )}
            {review.actionPlan && (
              <div className="space-y-1">
                <h4 className="text-xs font-semibold text-purple-500 uppercase tracking-wider">Action Plan</h4>
                <p className="text-sm whitespace-pre-wrap">{review.actionPlan}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {isEditOpen && (
        <ReviewFormDialog
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          review={review}
        />
      )}

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this review?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The review will be permanently removed from your log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => deleteReview.mutate({ id: review.id })}
              disabled={deleteReview.isPending}
            >
              {deleteReview.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function Reviews() {
  const [activeTab, setActiveTab] = useState<ListReviewsPeriod | "all">("weekly");
  const [isNewOpen, setIsNewOpen] = useState(false);
  
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: reviews, isLoading, isError } = useListReviews(
    { 
      period: activeTab === "all" ? undefined : activeTab,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    },
    { query: { queryKey: getListReviewsQueryKey({ 
      period: activeTab === "all" ? undefined : activeTab,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }) } }
  );

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Performance Reviews</h2>
          <p className="text-muted-foreground">Log your daily reflections, weekly summaries, and monthly deep-dives.</p>
        </div>
        <Button onClick={() => setIsNewOpen(true)} className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          New Review
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full sm:w-auto">
          <TabsList className="grid w-full grid-cols-4 h-10">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Input 
            type="date" 
            value={dateFrom} 
            onChange={(e) => setDateFrom(e.target.value)} 
            className="w-full sm:w-auto h-10"
            title="From Date"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input 
            type="date" 
            value={dateTo} 
            onChange={(e) => setDateTo(e.target.value)} 
            className="w-full sm:w-auto h-10"
            title="To Date"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-[200px] w-full rounded-xl" />
          <Skeleton className="h-[200px] w-full rounded-xl" />
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-8 text-center">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-3" />
          <p className="text-destructive font-medium">Failed to load reviews.</p>
        </div>
      ) : reviews?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border rounded-xl border-dashed">
          <FileText className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-semibold mb-1">No reviews found</h3>
          <p className="text-muted-foreground text-sm max-w-sm mb-6">
            You haven't written any reviews for this period. Start tracking your performance to improve your edge.
          </p>
          <Button onClick={() => setIsNewOpen(true)} variant="outline">
            Write your first review
          </Button>
        </div>
      ) : (
        <div className="grid gap-6">
          {reviews?.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}

      {isNewOpen && (
        <ReviewFormDialog
          open={isNewOpen}
          onOpenChange={setIsNewOpen}
          defaultPeriod={activeTab !== "all" ? activeTab : "weekly"}
        />
      )}
    </div>
  );
}
