"use client";

import { Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { canAccess, rankLabel } from "@/lib/format";
import type { Course, Rank } from "@/lib/types";
import { cn } from "@/lib/utils";

function progressOf(course: Course) {
  if (course.lessons.length === 0) return 0;
  const done = course.lessons.filter((lesson) => lesson.completed).length;
  return Math.round((done / course.lessons.length) * 100);
}

export function CourseCatalog({
  courses,
  userRank,
}: {
  courses: Course[];
  userRank: Rank;
}) {
  const [catalog, setCatalog] = useState(courses);
  const [filter, setFilter] = useState<"all" | "open">("all");
  const [openId, setOpenId] = useState<string | null>(catalog[0]?.id ?? null);

  const visible =
    filter === "open"
      ? catalog.filter((course) => canAccess(userRank, course.rankRequirement))
      : catalog;

  function toggleLesson(courseId: string, lessonId: string) {
    const course = catalog.find((item) => item.id === courseId);
    const lesson = course?.lessons.find((item) => item.id === lessonId);
    if (!course || !lesson || !canAccess(userRank, course.rankRequirement)) return;

    setCatalog((current) =>
      current.map((item) =>
        item.id !== courseId
          ? item
          : {
              ...item,
              lessons: item.lessons.map((entry) =>
                entry.id === lessonId ? { ...entry, completed: !entry.completed } : entry,
              ),
            },
      ),
    );

    toast.success(lesson.completed ? "Lección marcada como pendiente" : "Lección marcada como vista", {
      description: lesson.title,
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={filter === "all" ? "default" : "outline"}
          onClick={() => setFilter("all")}
        >
          Todos
        </Button>
        <Button
          type="button"
          size="sm"
          variant={filter === "open" ? "default" : "outline"}
          onClick={() => setFilter("open")}
        >
          Disponibles para tu rango
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {visible.map((course) => {
          const unlocked = canAccess(userRank, course.rankRequirement);
          const progress = progressOf(course);
          const done = course.lessons.filter((lesson) => lesson.completed).length;
          const open = openId === course.id;

          return (
            <article
              key={course.id}
              className={cn(
                "flex flex-col rounded-2xl border border-lyra-border bg-lyra-card p-5 shadow-[0_0_15px_rgba(124,58,237,0.15)]",
                !unlocked && "opacity-80",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <Badge variant={course.rankRequirement === "MAESTRO" ? "cyan" : course.rankRequirement === "LIDER" ? "violet" : "default"}>
                  {rankLabel[course.rankRequirement]}
                </Badge>
                {unlocked ? (
                  <span className="text-[10px] uppercase tracking-[0.16em] text-lyra-cyan">Abierto</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-zinc-400">
                    <Lock className="h-3 w-3" aria-hidden />
                    Requiere {rankLabel[course.rankRequirement]}
                  </span>
                )}
              </div>
              <h2 className="mt-4 text-lg tracking-wide text-white">{course.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-zinc-400">{course.description}</p>
              <div className="mt-5 space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>
                    {done} de {course.lessons.length} lecciones
                  </span>
                  <span className="font-mono tabular-nums text-zinc-300">{progress}%</span>
                </div>
                <Progress value={progress} />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-5 w-fit"
                onClick={() => setOpenId(open ? null : course.id)}
              >
                {open ? "Ocultar temario" : "Ver temario"}
              </Button>
              {open ? (
                <ul className="mt-4 space-y-2 border-t border-lyra-border pt-4">
                  {course.lessons.map((lesson, index) => (
                    <li
                      key={lesson.id}
                      className="rounded-xl border border-lyra-border bg-black/20 px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-white">
                            {index + 1}. {lesson.title}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-zinc-500">{lesson.description}</p>
                          <p className="mt-2 font-mono text-[11px] text-zinc-600">{lesson.videoUrl}</p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={lesson.completed ? "secondary" : "ghost"}
                          disabled={!unlocked}
                          onClick={() => toggleLesson(course.id, lesson.id)}
                        >
                          {unlocked ? (lesson.completed ? "Vista" : "Marcar") : "Bloqueada"}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
