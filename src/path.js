// src/path.js
// Simple road-graph + BFS shortest path with road + avenue support

export function buildGraph(grid) {
  const h = grid.length, w = grid[0].length;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const graph = {};

  const baseOf = (cell) => (cell && cell.includes("@") ? cell.split("@")[0] : cell);
  const isDriveable = (cell) => {
    const base = baseOf(cell);
    return base === "road" || base === "avenue";
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isDriveable(grid[y][x])) continue;
      const key = k(x, y);
      graph[key] = [];
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (isDriveable(grid[ny][nx])) graph[key].push(k(nx, ny));
      }
    }
  }
  return graph;
}

// Standard BFS shortest path
export function shortestPath(graph, start, goal) {
  if (start === goal) return [start];
  const q = [start];
  const prev = new Map([[start, null]]);

  while (q.length) {
    const v = q.shift();
    for (const n of (graph[v] || [])) {
      if (prev.has(n)) continue;
      prev.set(n, v);
      if (n === goal) {
        const path = [n];
        let cur = v;
        while (cur) {
          path.unshift(cur);
          cur = prev.get(cur);
        }
        return path;
      }
      q.push(n);
    }
  }
  return null;
}

export const k = (x, y) => `${x},${y}`;
export const unkey = (s) => s.split(",").map(n => parseInt(n, 10));
