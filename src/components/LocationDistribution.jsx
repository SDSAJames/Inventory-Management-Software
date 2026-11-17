import DistributionChart from './DistributionChart';

export default function LocationDistribution(props) {
  return <DistributionChart {...props} collapsedLegendLimit={5} label="Asset locations" emptyMessage="No assets to display by location." />;
}
