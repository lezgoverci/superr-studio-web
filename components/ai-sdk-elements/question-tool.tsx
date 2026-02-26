"use client";

import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type QuestionOption = {
  label: string;
  description: string;
};

type QuestionInfo = {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
};

type QuestionToolInput = {
  questions: QuestionInfo[];
};

type QuestionToolUIProps = {
  input: QuestionToolInput;
  onSubmit: (answers: string[][]) => void;
  onDismiss: () => void;
};

export function QuestionToolUI({
  input,
  onSubmit,
  onDismiss,
}: QuestionToolUIProps) {
  const questions = input.questions ?? [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<string[][]>(questions.map(() => []));

  const currentQuestion = questions[currentIndex];
  const currentAnswer = answers[currentIndex] ?? [];
  const isLastQuestion = currentIndex === questions.length - 1;
  const isFirstQuestion = currentIndex === 0;
  const totalQuestions = questions.length;

  const handleOptionToggle = useCallback(
    (label: string) => {
      setAnswers((prev) => {
        const newAnswers = [...prev];
        const current = newAnswers[currentIndex] ?? [];

        if (currentQuestion.multiple) {
          if (current.includes(label)) {
            newAnswers[currentIndex] = current.filter((l) => l !== label);
          } else {
            newAnswers[currentIndex] = [...current, label];
          }
        } else {
          newAnswers[currentIndex] = [label];
        }

        return newAnswers;
      });
    },
    [currentIndex, currentQuestion.multiple]
  );

  const handleCustomInput = useCallback(
    (value: string) => {
      setAnswers((prev) => {
        const newAnswers = [...prev];
        newAnswers[currentIndex] = value ? [value] : [];
        return newAnswers;
      });
    },
    [currentIndex]
  );

  const handleNext = useCallback(() => {
    if (!isLastQuestion) {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [isLastQuestion]);

  const handlePrev = useCallback(() => {
    if (!isFirstQuestion) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [isFirstQuestion]);

  const handleSubmit = useCallback(() => {
    onSubmit(answers);
  }, [answers, onSubmit]);

  const canSubmit =
    answers.every((a) => a.length > 0) && answers.length === totalQuestions;

  if (!currentQuestion) {
    return (
      <div className="rounded-md border border-yellow-500/50 bg-yellow-50/50 p-4">
        <p className="text-muted-foreground text-sm">No questions available</p>
      </div>
    );
  }

  return (
    <div className="not-prose mb-4 w-full rounded-md border border-yellow-500/50 bg-yellow-50/50">
      <div className="flex items-center justify-between border-yellow-500/20 border-b px-3 py-2">
        <span className="font-medium text-sm text-yellow-900">
          {currentQuestion.header || "Question"}
        </span>
        <span className="text-xs text-yellow-700">
          {currentIndex + 1} of {totalQuestions}
        </span>
      </div>

      <div className="p-4">
        <p className="mb-4 text-sm text-yellow-900">
          {currentQuestion.question}
        </p>

        <div className="mb-4 space-y-2">
          {currentQuestion.options?.map((option, idx) => (
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                currentAnswer.includes(option.label)
                  ? "border-yellow-500 bg-yellow-100/50"
                  : "border-border hover:bg-muted/50"
              )}
              key={idx}
            >
              <input
                checked={currentAnswer.includes(option.label)}
                className="mt-0.5 shrink-0"
                name={`question-${currentIndex}`}
                onChange={() => handleOptionToggle(option.label)}
                type={currentQuestion.multiple ? "checkbox" : "radio"}
              />
              <div className="flex-1">
                <div className="font-medium text-sm text-yellow-900">
                  {option.label}
                </div>
                {option.description && (
                  <div className="text-xs text-yellow-700">
                    {option.description}
                  </div>
                )}
              </div>
            </label>
          ))}
        </div>

        {currentQuestion.custom !== false && (
          <div className="mb-4">
            <label className="font-medium text-xs text-yellow-800">
              Or enter your own answer
            </label>
            <input
              className="mt-1 w-full rounded-md border border-yellow-300 bg-white px-3 py-2 text-sm text-yellow-900 placeholder:text-yellow-600 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
              onChange={(e) => handleCustomInput(e.target.value)}
              placeholder="Type your answer..."
              type="text"
              value={currentAnswer[0] ?? ""}
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-yellow-500/20 border-t px-3 py-2">
        <div className="flex gap-2">
          {!isFirstQuestion && (
            <Button
              className="text-yellow-800 hover:bg-yellow-100 hover:text-yellow-900"
              onClick={handlePrev}
              size="sm"
              variant="ghost"
            >
              <ChevronLeft className="mr-1 size-4" />
              Back
            </Button>
          )}
          <Button
            className="text-yellow-800 hover:bg-yellow-100 hover:text-yellow-900"
            onClick={onDismiss}
            size="sm"
            variant="ghost"
          >
            <X className="mr-1 size-4" />
            Dismiss
          </Button>
        </div>

        {isLastQuestion ? (
          <Button
            className="bg-yellow-600 text-white hover:bg-yellow-700"
            disabled={!canSubmit}
            onClick={handleSubmit}
            size="sm"
          >
            Submit
            <Check className="ml-1 size-4" />
          </Button>
        ) : (
          <Button
            className="bg-yellow-600 text-white hover:bg-yellow-700"
            onClick={handleNext}
            size="sm"
          >
            Next
            <ChevronRight className="ml-1 size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
