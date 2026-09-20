// 육각형 그리드 유틸리티

/**
 * 육각형 그리드의 6방향 인접 셀 계산
 * offset coordinates (짝수 행이 왼쪽으로 정렬)
 */
export function getHexNeighborOffsets(row: number): Array<{ dr: number; dc: number }> {
  const isEvenRow = row % 2 === 0;
  
  if (isEvenRow) {
    return [
      { dr: -1, dc: -1 }, // 위-왼쪽
      { dr: -1, dc: 0 },  // 위-오른쪽
      { dr: 0, dc: -1 },  // 왼쪽
      { dr: 0, dc: 1 },   // 오른쪽
      { dr: 1, dc: -1 },  // 아래-왼쪽
      { dr: 1, dc: 0 },   // 아래-오른쪽
    ];
  } else {
    return [
      { dr: -1, dc: 0 },  // 위-왼쪽
      { dr: -1, dc: 1 },  // 위-오른쪽
      { dr: 0, dc: -1 },  // 왼쪽
      { dr: 0, dc: 1 },   // 오른쪽
      { dr: 1, dc: 0 },   // 아래-왼쪽
      { dr: 1, dc: 1 },   // 아래-오른쪽
    ];
  }
}

/**
 * 4방향만 (직선 이동)
 */
export function getHexCardinalOffsets(row: number): Array<{ dr: number; dc: number }> {
  const isEvenRow = row % 2 === 0;
  
  if (isEvenRow) {
    return [
      { dr: -1, dc: 0 },  // 위-오른쪽
      { dr: 0, dc: -1 },  // 왼쪽
      { dr: 0, dc: 1 },   // 오른쪽
      { dr: 1, dc: 0 },   // 아래-오른쪽
    ];
  } else {
    return [
      { dr: -1, dc: 0 },  // 위-왼쪽
      { dr: 0, dc: -1 },  // 왼쪽
      { dr: 0, dc: 1 },   // 오른쪽
      { dr: 1, dc: 0 },   // 아래-왼쪽
    ];
  }
}

/**
 * 헥사곤 그리드에서 두 셀 사이의 실제 거리 계산 (offset coordinates)
 * offset coordinates를 axial coordinates로 변환 후 거리 계산
 */
export function hexDistance(row1: number, col1: number, row2: number, col2: number): number {
  const a = toAxial(row1, col1);
  const b = toAxial(row2, col2);
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  // cube 에서 s = -q - r 이므로 ds = -(dq + dr)
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/**
 * offset → axial.
 *
 * 이 격자는 홀수 행이 오른쪽으로 반 칸 밀린 배치다(odd-r). 화면의
 * hexX 도, 위의 이웃 표도 그 전제로 쓰여 있다.
 *
 * 예전 구현은 여기서만 열 기준(odd-q)으로 변환하고 있었다. 이웃 표와
 * 좌표계가 어긋나 있어서 거리가 실제 인접 관계와 맞지 않았고, 시야 반경과
 * 행정 거리가 한 축으로 찌그러져 있었다.
 */
function toAxial(row: number, col: number): { q: number; r: number } {
  return { q: col - (row - (row & 1)) / 2, r: row };
}

