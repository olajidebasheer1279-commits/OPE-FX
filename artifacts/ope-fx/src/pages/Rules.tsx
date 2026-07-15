import { useMemo, useState } from "react";
import { AlertCircle, Plus, RefreshCcw, Search, Target, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";
import {
  useListRules,
  useCreateRule,
  useUpdateRule,
  useDeleteRule,
  getListRulesQueryKey,
  type Rule,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";

const RULE_CATEGORIES = [
  "Market Structure",
  "POI",
  "Confirmation",
  "Risk Management",
  "Psychology",
] as const;

function RuleFormDialog({
  open,
  onOpenChange,
  rule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule?: Rule;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(rule?.title ?? "");
  const [description, setDescription] = useState(rule?.description ?? "");
  const [category, setCategory] = useState<string>(rule?.category ?? RULE_CATEGORIES[0]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListRulesQueryKey() });

  const createMutation = useCreateRule({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Rule added" });
        onOpenChange(false);
      },
      onError: (err) => toast({ title: "Failed to save rule", description: err.message, variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateRule({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Rule updated" });
        onOpenChange(false);
      },
      onError: (err) => toast({ title: "Failed to save rule", description: err.message, variant: "destructive" }),
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const payload = { title: title.trim(), description: description.trim() || undefined, category };
    if (rule) {
      updateMutation.mutate({ id: rule.id, data: payload });
    } else {
      createMutation.mutate({ data: payload });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setTitle(rule?.title ?? "");
          setDescription(rule?.description ?? "");
          setCategory(rule?.category ?? RULE_CATEGORIES[0]);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{rule ? "Edit Rule" : "Add Rule"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Only trade with the trend" required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RULE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Textarea rows={3} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} placeholder="Why this rule matters..." />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSaving}>{rule ? "Save Changes" : "Add Rule"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Rules() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [category, setCategory] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | undefined>(undefined);
  const [deletingRule, setDeletingRule] = useState<Rule | undefined>(undefined);

  const { data, isLoading, error, refetch } = useListRules({
    search: debouncedSearch || undefined,
    category: category === "all" ? undefined : category,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListRulesQueryKey() });

  const toggleMutation = useUpdateRule({
    mutation: {
      onSuccess: invalidate,
      onError: (err) => toast({ title: "Failed to update rule", description: err.message, variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteRule({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Rule removed" });
        setDeletingRule(undefined);
      },
      onError: (err) => toast({ title: "Failed to delete rule", description: err.message, variant: "destructive" }),
    },
  });

  const rules = data ?? [];
  const progress = useMemo(() => {
    if (rules.length === 0) return 0;
    return Math.round((rules.filter((r) => r.completed).length / rules.length) * 100);
  }, [rules]);

  const grouped = useMemo(() => {
    const map = new Map<string, Rule[]>();
    for (const cat of RULE_CATEGORIES) map.set(cat, []);
    for (const r of rules) {
      if (!map.has(r.category)) map.set(r.category, []);
      map.get(r.category)!.push(r);
    }
    return Array.from(map.entries()).filter(([, items]) => items.length > 0);
  }, [rules]);

  const openCreate = () => {
    setEditingRule(undefined);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 lg:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Trading Playbook</h1>
          <p className="text-sm text-muted-foreground">Your rules for staying disciplined and consistent.</p>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-primary text-primary-foreground">
          <Plus className="h-4 w-4" /> Add Rule
        </Button>
      </div>

      <div className="p-6 rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h3 className="font-semibold tracking-tight">Checklist Progress</h3>
          </div>
          <span className="text-2xl font-semibold font-mono tracking-tight">{progress}%</span>
        </div>
        <div className="h-2.5 w-full bg-secondary rounded-full overflow-hidden border border-border">
          <div className="h-full bg-primary transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-xs text-muted-foreground mt-2 font-mono">
          {rules.filter((r) => r.completed).length} of {rules.length} rules checked
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search rules..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full md:w-48"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {RULE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center h-[30vh] text-center border border-border bg-card/50 rounded-xl p-8">
          <AlertCircle className="h-10 w-10 text-destructive mb-4" />
          <p className="text-muted-foreground mb-4">Failed to load rules.</p>
          <Button onClick={() => refetch()} className="gap-2"><RefreshCcw className="h-4 w-4" /> Retry</Button>
        </div>
      ) : rules.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center text-center border border-dashed border-border rounded-lg bg-secondary/20">
          <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center mb-4">
            <Target className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium mb-1">No rules yet</p>
          <p className="text-sm text-muted-foreground max-w-sm mb-4">Build your trading playbook by adding the rules that define your edge.</p>
          <Button onClick={openCreate} variant="outline" className="border-border">Add First Rule</Button>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([cat, items]) => (
            <div key={cat} className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
                <h3 className="font-semibold tracking-tight text-sm">{cat}</h3>
                <span className="text-xs font-mono text-muted-foreground">
                  {items.filter((r) => r.completed).length}/{items.length}
                </span>
              </div>
              <div className="divide-y divide-border/50">
                {items.map((rule) => (
                  <div key={rule.id} className="group flex items-start gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors">
                    <Checkbox
                      checked={rule.completed}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ id: rule.id, data: { completed: checked === true } })
                      }
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${rule.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {rule.title}
                      </p>
                      {rule.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingRule(rule); setFormOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeletingRule(rule)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <RuleFormDialog open={formOpen} onOpenChange={setFormOpen} rule={editingRule} />

      <AlertDialog open={!!deletingRule} onOpenChange={(open) => !open && setDeletingRule(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deletingRule?.title}" will be permanently removed from your playbook.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingRule && deleteMutation.mutate({ id: deletingRule.id })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
