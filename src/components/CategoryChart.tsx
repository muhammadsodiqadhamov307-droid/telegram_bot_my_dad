import { useQuery } from '@tanstack/react-query';
import { Doughnut } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend
} from 'chart.js';
import { apiClient } from '../lib/api';

ChartJS.register(ArcElement, Tooltip, Legend);

function CategoryChart() {
    const { data: categoryBreakdown = {} } = useQuery({
        queryKey: ['category-breakdown'],
        queryFn: () => apiClient.getCategoryBreakdown(30).then(res => res.data),
    });

    // Prepare chart data for expenses only
    const categories = Object.entries(categoryBreakdown)
        .map(([name, data]: [string, any]) => ({
            name,
            amount: data.expense,
            color: data.color,
        }))
        .filter(c => c.amount > 0)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8); // Top 8 categories

    const data = {
        labels: categories.map(c => c.name),
        datasets: [
            {
                data: categories.map(c => c.amount),
                backgroundColor: categories.map(c => c.color),
                borderColor: 'rgba(255, 255, 255, 0.5)',
                borderWidth: 2,
            },
        ],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'right' as const,
                labels: {
                    boxWidth: 12,
                    padding: 10,
                    font: {
                        size: 11
                    }
                }
            },
            tooltip: {
                callbacks: {
                    label: function (context: any) {
                        const label = context.label || '';
                        const value = new Intl.NumberFormat('uz-UZ').format(context.parsed) + ' UZS';
                        const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
                        const percentage = ((context.parsed / total) * 100).toFixed(1);
                        return `${label}: ${value} (${percentage}%)`;
                    }
                }
            }
        }
    };

    if (categories.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 text-gray-500">
                <p>Ma'lumot yo'q</p>
            </div>
        );
    }

    return (
        <div style={{ height: '300px' }}>
            <Doughnut data={data} options={options} />
        </div>
    );
}

export default CategoryChart;
