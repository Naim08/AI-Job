import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

interface DecisionNode {
  title: string;
  pass: boolean;
  children?: DecisionNode[];
}

interface DecisionTreeProps {
  data: DecisionNode;
}

export const DecisionTree: React.FC<DecisionTreeProps> = ({ data }) => {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!data || !ref.current) return;
    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();
    const width = 500, height = 300;
    const root = d3.hierarchy(data);
    const treeLayout = d3.tree<DecisionNode>().size([width, height - 50]);
    treeLayout(root);

    // Collapse/expand state
    root.descendants().forEach(d => (d as any)._collapsed = false);

    function update(source: any) {
      svg.selectAll('*').remove();
      const nodes = root.descendants();
      const links = root.links();
      // Draw links
      svg.selectAll('path')
        .data(links)
        .enter()
        .append('path')
        .attr('d', d3.linkHorizontal<SVGPathElement, d3.HierarchyLink<DecisionNode>, d3.HierarchyNode<DecisionNode>>()
          .x(node => node.y!)
          .y(node => node.x!))
        .attr('stroke', '#888')
        .attr('fill', 'none');
      // Draw nodes
      const node = svg.selectAll('g')
        .data(nodes)
        .enter()
        .append('g')
        .attr('transform', (d: any) => `translate(${d.y},${d.x})`)
        .style('cursor', 'pointer')
        .on('click', function (event, d: any) {
          if (d.children) {
            d._children = d.children;
            d.children = null;
          } else if (d._children) {
            d.children = d._children;
            d._children = null;
          }
          update(d);
        });
      node.append('circle')
        .attr('r', 16)
        .attr('fill', (d: any) => d.data.pass ? '#22c55e' : '#ef4444');
      node.append('text')
        .attr('dy', 5)
        .attr('x', 0)
        .attr('text-anchor', 'middle')
        .attr('fill', '#fff')
        .text((d: any) => d.data.title);
    }
    update(root);
  }, [data]);

  return <svg ref={ref} width={500} height={300} />;
};
