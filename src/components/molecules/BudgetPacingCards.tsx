import React from 'react';
// Assuming shadcn/ui components are available
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { BudgetStatus } from "../../types";

interface BudgetPacingCardsProps {
  status: BudgetStatus;
}

export const BudgetPacingCards: React.FC<BudgetPacingCardsProps> = ({ status }) => {
  const getPacingColor = (status: string) => {
    if (status.includes("과다")) return "destructive";
    if (status.includes("과소")) return "outline";
    return "default";
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">소진액</CardTitle>
          <span className="text-xs text-muted-foreground">Spent</span>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">₩{status.spent.toLocaleString()}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">잔여 예산</CardTitle>
          <span className="text-xs text-muted-foreground">Remaining</span>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">₩{status.remaining.toLocaleString()}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">소진율 (Burn Rate)</CardTitle>
          <Badge variant={status.burn_rate > 90 ? "destructive" : "secondary"}>
            {status.burn_rate.toFixed(1)}%
          </Badge>
        </CardHeader>
        <CardContent>
          <Progress value={status.burn_rate} className="mt-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pacing Index</CardTitle>
          <Badge variant={getPacingColor(status.pacing_status)}>
            {status.pacing_status}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{status.pacing_index.toFixed(1)}</div>
          <p className="text-xs text-muted-foreground mt-1">
            (100 기준: {status.pacing_index > 100 ? "빠름" : "느림"})
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
