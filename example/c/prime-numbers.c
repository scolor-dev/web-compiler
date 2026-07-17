#include <stdio.h>

int is_prime(int number) {
  if (number < 2) {
    return 0;
  }

  for (int divisor = 2; divisor * divisor <= number; divisor++) {
    if (number % divisor == 0) {
      return 0;
    }
  }
  return 1;
}

int main() {
  printf("Primes: ");
  for (int number = 2; number <= 50; number++) {
    if (is_prime(number)) {
      printf("%d ", number);
    }
  }
  printf("\n");

  return 0;
}
