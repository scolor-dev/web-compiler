#include <stdio.h>

int main() {
  int previous = 0;
  int current = 1;

  printf("Fibonacci: ");
  for (int i = 0; i < 10; i++) {
    printf("%d ", previous);
    int next = previous + current;
    previous = current;
    current = next;
  }
  printf("\n");

  return 0;
}
