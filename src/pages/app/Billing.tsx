import BillingTab from "../../components/billing/BillingTab"
import { useRole } from "../../components/app/AppLayout"
import { PageHeader } from "../../components/ui"

export default function Billing() {
  const { r } = useRole()

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Billing & Subscription"
        desc="Your plan, usage, transparently priced add-ons and payments."
      />
      <BillingTab actor={`${r.user} (customer)`} />
    </div>
  )
}
