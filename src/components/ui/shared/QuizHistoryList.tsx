'use client';

import type { QuizHistoryEntry } from '@/index';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Target, Calendar, XCircle, CheckCircle2 } from 'lucide-react';

function getScoreClass(percentage: number) {
  if (percentage >= 80) return 'bg-green-500/20 text-green-400';
  if (percentage >= 50) return 'bg-yellow-500/20 text-yellow-400';
  return 'bg-red-500/20 text-red-400';
}

export function QuizHistoryList({ history }: { history: QuizHistoryEntry[] }) {
  if (!history || history.length === 0) {
    return (
      <Card className="glass-card border-primary/20 mt-8">
        <CardContent className="flex flex-col items-center justify-center p-8 text-muted-foreground">
          <Target className="w-12 h-12 mb-4 opacity-50" />
          <p>No quiz history yet. Take a quiz to see your stats here!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 mt-8">
      <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
        <Target className="w-5 h-5 text-primary" /> Performance History
      </h3>
      
      <Accordion type="single" collapsible className="w-full space-y-2">
        {history.map((result) => {
          const percentage = result.score_percentage;
          const date = new Date(result.created_at).toLocaleDateString('en-US', { 
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
          });

          return (
            <AccordionItem value={result.id} key={result.id} className="glass-card border-primary/20 px-4 rounded-xl">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${getScoreClass(percentage)}`}>
                      {percentage}%
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="font-semibold">{result.mode.toUpperCase()} Mode</span>
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {date}
                      </span>
                    </div>
                  </div>
                  <div className="text-sm font-medium">
                    {result.correct_cards} / {result.total_cards} Correct
                  </div>
                </div>
              </AccordionTrigger>
              
              <AccordionContent className="pt-4 pb-6 border-t border-primary/10">
                {result.incorrect_answers && result.incorrect_answers.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-red-400 font-medium mb-2">Needs Review ({result.wrong_count} Missed):</p>
                    {result.incorrect_answers.map((mistake, i) => (
                      <div key={i} className="bg-background/50 p-3 rounded-lg border border-red-500/20 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            {mistake.card_number ? `Card #${mistake.card_number}` : 'Card #?'}
                          </span>
                          <p className="text-sm font-medium">{mistake.prompt}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex items-start gap-1 text-red-400">
                            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                              You answered: <br/>
                              <strong className="opacity-80">{mistake.user_answer ?? 'Not recorded for this attempt'}</strong>
                            </span>
                          </div>
                          <div className="flex items-start gap-1 text-green-400">
                            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>Correct term: <br/><strong className="opacity-80">{mistake.correct_answer}</strong></span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-green-400 p-4 bg-green-500/10 rounded-lg">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Flawless run! You got everything correct.</span>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}