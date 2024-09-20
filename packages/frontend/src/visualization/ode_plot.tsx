import type { EChartsOption } from "echarts";
import { lazy } from "solid-js";

const ECharts = lazy(() => import("./echarts"));

/** Values of a state variable over time. */
export type StateVarData = {
    name: string;
    data: number[];
};

/** Data plotted by `ODEPlot` component. */
export type ODEPlotData = {
    time: number[];
    states: StateVarData[];
};

/** Plot the results of an ODE simulation. */
export function ODEPlot(props: {
    data: ODEPlotData;
}) {
    const options = (): EChartsOption => ({
        legend: {
            data: props.data.states.map((state) => state.name),
        },
        xAxis: {
            name: "time",
            data: props.data.time,
            axisLabel: {
                formatter: (_: string, i: number) => formatTimeLabel(props.data.time[i]),
            },
        },
        yAxis: {
            type: "value",
        },
        series: props.data.states.map((state) => ({
            name: state.name,
            data: state.data,
            type: "line",
            symbol: "none",
        })),
    });

    return <ECharts option={options()} />;
}

const formatTimeLabel = (x: number): string => {
    const label = x.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
    });
    /// XXX: Hack to get some extra padding.
    return ` ${label} `;
};
