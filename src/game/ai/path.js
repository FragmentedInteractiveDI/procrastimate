// src/game/ai/path.js
// Road graph + A* for grid movement on "driveable" tiles (road/avenue)

const key = (x, y) => `${x},${y}`;
const unkey = (k) => {
  const i = k.indexOf(",");
  return { x: parseInt(k.slice(0, i), 10), y: parseInt(k.slice(i + 1), 10) };
};

// Manhattan heuristic for 4-neighbour grid
const H = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// Build a graph out of a grid of booleans + an optional cost selector per cell
export function buildRoadGraph(grid, isDriveable, edgeCost) {
  const h = grid.length;
  const w = grid[0]?.length || 0;

  const nodes = new Map();
  const edges = new Map();

  const addNode = (x, y) => {
    const k = key(x, y);
    if (!nodes.has(k)) nodes.set(k, { x, y });
    if (!edges.has(k)) edges.set(k, []);
    return k;
  };

  const costFor = (x, y) => (edgeCost ? edgeCost(x, y) : 1);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isDriveable(x, y)) continue;
      const k0 = addNode(x, y);
      // 4-neighbour connections
      const neigh = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ];
      for (const [nx, ny] of neigh) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (!isDriveable(nx, ny)) continue;
        const k1 = addNode(nx, ny);
        edges.get(k0).push({ to: k1, cost: costFor(nx, ny) });
      }
    }
  }

  return { nodes, edges };
}

export function aStar(graph, startKey, goalKey) {
  if (!graph.nodes.has(startKey) || !graph.nodes.has(goalKey)) return null;

  const open = new Set([startKey]);
  const came = new Map();
  const g = new Map([[startKey, 0]]);
  const f = new Map([[startKey, H(graph.nodes.get(startKey), graph.nodes.get(goalKey))]]);

  const popBest = () => {
    let best = null, bestF = Infinity;
    for (const k of open) {
      const val = f.get(k) ?? Infinity;
      if (val < bestF) { bestF = val; best = k; }
    }
    return best;
  };

  while (open.size) {
    const cur = popBest();
    if (cur == null) break;
    if (cur === goalKey) {
      // reconstruct
      const out = [];
      let c = cur;
      while (c) { out.push(c); c = came.get(c); }
      return out.reverse();
    }
    open.delete(cur);

    const gc = g.get(cur) ?? Infinity;
    for (const { to, cost } of graph.edges.get(cur) || []) {
      const tentative = gc + (cost ?? 1);
      if (tentative < (g.get(to) ?? Infinity)) {
        came.set(to, cur);
        g.set(to, tentative);
        const h = H(graph.nodes.get(to), graph.nodes.get(goalKey));
        f.set(to, tentative + h);
        open.add(to);
      }
    }
  }
  return null;
}

// Find nearest driveable cell to (gx, gy) using BFS ring expansion
export function nearestRoadKey(isDriveable, w, h, gx, gy) {
  const inb = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  if (inb(gx, gy) && isDriveable(gx, gy)) return key(gx, gy);

  const q = [[gx, gy]];
  const seen = new Set([key(gx, gy)]);
  while (q.length) {
    const [x, y] = q.shift();
    const nbr = [
      [x + 1, y], [x - 1, y],
      [x, y + 1], [x, y - 1]
    ];
    for (const [nx, ny] of nbr) {
      if (!inb(nx, ny)) continue;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      if (isDriveable(nx, ny)) return k;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return null;
}

export const cellKey = key;
export const fromKey = unkey;
