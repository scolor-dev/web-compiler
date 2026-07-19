#include <stdio.h>

int main(void) {
  int item_total = 3000;
  int shipping = 500;

  // 仕様: 請求額は商品合計 + 送料であるべき。
  // 構文も型も正しいため、通常のLintだけでは「-」の誤りを断定できない。
  int billed_total = item_total - shipping;

  printf("請求額: %d\n", billed_total);
  return 0;
}
