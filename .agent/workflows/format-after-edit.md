---
description: Run prettier --write after every file edit
---

After every file edit (using write_to_file, replace_file_content, or multi_replace_file_content), run Prettier to format the changed file(s):

// turbo-all

1. Run `npx prettier --write <file_path>` for each file that was edited.
   - If multiple files were edited, you can pass them all at once: `npx prettier --write <file1> <file2> ...`
