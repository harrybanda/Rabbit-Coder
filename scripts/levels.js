module.exports = [
  // level 0
  {
    path: [
      [2, 3],
      [3, 3],
      [4, 3]
    ],
    blocks: 2,
    facing: "east"
  },
  // level 1
  {
    path: [
      [2, 4],
      [2, 3],
      [3, 3],
      [4, 3]
    ],
    blocks: 4,
    facing: "north"
  },
  // level 2
  {
    path: [
      [4, 4],
      [3, 4],
      [3, 3],
      [3, 2],
      [2, 2]
    ],
    blocks: 6,
    facing: "west"
  },
  // level 3
  {
    path: [
      [5, 3],
      [4, 3],
      [3, 3],
      [2, 3],
      [1, 3]
    ],
    blocks: 3,
    facing: "west"
  },
  // level 4
  {
    path: [
      [1, 5],
      [2, 5],
      [3, 5],
      [4, 5],
      [4, 4],
      [4, 3],
      [4, 2],
      [3, 2],
      [2, 2],
      [1, 2]
    ],
    blocks: 6,
    facing: "east"
  },
  // level 5
  {
    path: [
      [1, 5],
      [1, 4],
      [2, 4],
      [2, 3],
      [3, 3],
      [3, 2],
      [4, 2],
      [4, 1],
      [5, 1]
    ],
    blocks: 6,
    facing: "north"
  },
  // level 6
  {
    path: [
      [3, 4],
      [2, 4],
      [3, 3],
      [3, 2]
    ],
    blocks: 8,
    obstacle: 2,
    switches: [1],
    facing: "north"
  },
  // level 7
  {
    path: [
      [3, 4],
      [3, 3],
      [3, 2],
      [4, 4],
      [5, 4]
    ],
    blocks: 9,
    obstacle: 3,
    switches: [1, 2],
    facing: "south"
  },
  // level 8
  {
    path: [
      [3, 3],
      [2, 3],
      [2, 4],
      [3, 4],
      [4, 3],
      [5, 3]
    ],
    blocks: 7,
    obstacle: 4,
    switches: [3, 1],
    facing: "south"
  }
];
