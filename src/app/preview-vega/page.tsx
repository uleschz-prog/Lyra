import { CreditProvider } from "@/components/dashboard/credit-provider";
import { VegaChat } from "@/components/vega/vega-chat";

export default function PreviewVega() {
  const now = new Date().toISOString();
  return (
    <CreditProvider initialBalance={340} initialTransactions={[]} totalEarnedCommissions={0}>
      <div className="min-h-screen bg-[#F6F4F1] p-6">
        <VegaChat
          firstName="Ana"
          initialChats={[
            { id: "c1", title: "Mensaje para invitar a Carlos", updatedAt: now },
            { id: "c2", title: "Plan de prospección de la semana", updatedAt: now },
          ]}
        />
      </div>
    </CreditProvider>
  );
}
