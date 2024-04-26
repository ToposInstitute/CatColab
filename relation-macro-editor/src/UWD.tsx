import * as d3 from "d3"

export function UWD(boxes: Array<any>, junctions: Array<any>): Element {
  const nodes: Array<any> =
    boxes.map(
      b => {return {
        type: "box",
        name: b.get("name"),
        fill: "#000",
      }}
    )
    .concat(junctions.map(
      j => {return {
        type: "junction",
        name: j.get("name"),
        fill: j.get("exposed") ? "red" : "black",
      }}
    ))

  const links = []
  const junctionMap: Map<string, number> = new Map()

  for (let i = 0; i < junctions.length; i++) {
    let j = junctions[i]
    junctionMap.set(j.get('name'), boxes.length + i)
  }

  for (let i = 0; i < boxes.length; i++) {
    let b = boxes[i]
    let ps: Array<any> = b.get('ports').toArray()
    for (const p of ps) {
      let j = p.get('junction')
      console.log(j)
      links.push({
        source: i,
        target: junctionMap.get(j) as number,
      })
    }
  }

  console.log(links)

  const width = 400
  const height = 600

  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).distance(_ => 60))
    .force("charge", d3.forceManyBody())
    .force("center", d3.forceCenter(width / 2, height / 2))
    .on("tick", ticked)

  const svg = d3.create("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .attr("style", "max-width: 100%; height: auto;")

  const link = svg.append("g")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
    .selectAll()
    .data(links)
    .join("line")

  const node = svg.append("g")
      .attr("stroke", "#000")
      .attr("stroke-width", 1.5)
    .selectAll()
    .data(nodes)
    .enter().append("g")

  const circle = node.append("circle")
    .attr("r", d => d.type == "box" ? 30 : 5)
    .attr("fill", d => d.type == "box" ? "#fff" : "#000")

  const text = node.append("text")
    .attr("dx", d => d.type == "junction" ? 12 : 0)
    .attr("dy", d => d.type == "junction" ? ".35em" : 0)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .text(d => d.name)

  node.call(d3.drag()
    .on("start", dragstarted)
    .on("drag", dragged)
    .on("end", dragended))

  function dragstarted(event: any) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }

  function dragged(event: any) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }

  function dragended(event: any) {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  }

  function ticked() {
    link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y)

    node
        .attr("x", d => d.x)
        .attr("y", d => d.y);

    circle
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);

    text
        .attr("x", d => d.x)
        .attr("y", d => d.y);
  }

  return svg.node() as Element
}
