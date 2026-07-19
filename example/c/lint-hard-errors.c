int main(void) {
  int mode = 1;

  // breakのタイプミス。未定義の識別子として検出される。
  for (int i = 0; i < 3; i++) {
    if (i == mode) {
      brake;
    }
  }

  // 同じcase値を2回定義している。
  switch (mode) {
    case 1:
      mode++;
      break;
    case 1:
      mode--;
      break;
  }

  // ループやswitchの外にあるbreak。
  break;
  return mode;
}
