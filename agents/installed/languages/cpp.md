# C++

**Precedence:** `.clang-format`, `.clang-tidy`, `CMakeLists`/build flags, and C++ standard set by the project override this file.

## Style

- Use the project’s dialect (C++17/20/23); don’t upgrade the standard casually
- RAII everywhere; avoid raw `new`/`delete` when smart pointers/containers suffice
- Prefer `nullptr`, `override`, `= delete`, scoped enums
- `const`/`constexpr` by default where practical
- Headers: self-contained; forward declare when it reduces coupling
- Exceptions: match project policy (many codebases are `-fno-exceptions`)
- Naming: follow existing code (Google/LLVM/Qt styles differ — don’t invent a third)

## Tools

- Format: `clang-format`
- Lint: `clang-tidy`
- Build: CMake/Ninja/Make as the repo defines
