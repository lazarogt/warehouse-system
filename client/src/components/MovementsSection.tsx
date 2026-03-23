import InventorySection from "./InventorySection";

type MovementsSectionProps = {
  apiBaseUrl: string;
};

export default function MovementsSection({ apiBaseUrl }: MovementsSectionProps) {
  return <InventorySection apiBaseUrl={apiBaseUrl} mode="movements" />;
}
