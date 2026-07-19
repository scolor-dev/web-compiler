#include <stdio.h>

int main(void) {
  int values[] = {10, 20, 30, 40, 50};
  int total = 0;

  // 配列は5件なのに4件しか処理しない。
  for (int i = 0; i < 4; i++) {
    total += values[i];
  }

  int ready = 0;
  // 比較ではなく代入になっている。
  if (ready = 1) {
    puts("ready");
  }

  int retries = 3;
  // 条件が代入なのでループに入らない。
  while (retries = 0) {
    retries--;
  }

  // case 0にbreakがなく、case 1へフォールスルーする。
  switch (total) {
    case 0:
      puts("empty");
    case 1:
      puts("one");
      break;
    default:
      break;
  }

  int matrix[2][3] = {
    {1, 2, 3},
    {4, 5, 6},
  };
  int matrix_total = 0;
  // 2行あるのに先頭1行しか処理しない。
  for (int row = 0; row < 1; row++) {
    for (int column = 0; column < 3; column++) {
      matrix_total += matrix[row][column];
    }
  }

  printf("%d %d\n", total, matrix_total);
  return 0;
}
