export const SAMPLE_CODE = {
python: `
# Python Sample Code
print("Hello, World!")
name = input("What is your name? ")
print(f"Nice to meet you, {name}!")
`,

javascript: `
// JavaScript Sample Code
console.log("Hello, World!");
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

readline.question('What is your name? ', name => {
  console.log(\`Nice to meet you, \${name}!\`);
  readline.close();
});
`,

java: `
// Java Sample Code
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
        
        // Read user input
        System.out.print("What is your name? ");
        java.util.Scanner scanner = new java.util.Scanner(System.in);
        String name = scanner.nextLine();
        
        System.out.println("Nice to meet you, " + name + "!");
        scanner.close();
    }
}
`,

c: `
// C Sample Code
#include <stdio.h>

int main() {
    printf("Hello, World!");
    
    // Read user input
    char name[100];
    printf("What is your name? ");
    scanf("%s", name);
    
    printf("Nice to meet you, %s!", name);
    return 0;
}
`,

cpp: `
// C++ Sample Code
#include <iostream>

int main() {
  std::cout << "Hello, World!" << std::endl;
  
  // Read user input
  std::string name;
  std::cout << "What is your name? ";
  std::cin >> name;
  
  std::cout << "Nice to meet you, " << name << "!" << std::endl;
  return 0;
}
`,
};