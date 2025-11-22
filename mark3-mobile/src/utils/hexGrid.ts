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
  // offset → axial 변환
  const q1 = col1;
  const r1 = row1 - Math.floor((col1 - (col1 & 1)) / 2);
  
  const q2 = col2;
  const r2 = row2 - Math.floor((col2 - (col2 & 1)) / 2);
  
  // axial → cube 변환 (s = -q - r)
  const s1 = -q1 - r1;
  const s2 = -q2 - r2;
  
  // cube coordinates에서 거리 계산
  return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(s1 - s2)) / 2;
}

