
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface CategoryChartProps {
    data: { category: string; amount: number; color: string }[];
}

const CategoryChart: React.FC<CategoryChartProps> = ({ data }) => {
    return (
        <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="amount"
                        nameKey="category"
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: '#fff' }}
                        formatter={(value: number) => `${value.toLocaleString()} UZS`}
                    />
                    <Legend iconType="circle" />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

export default CategoryChart;
