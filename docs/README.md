# Documentation

Project documentation will be placed here.

## Backend API

### `POST /api/clone`

Clone a Git repository into a user specific directory. Example body:

```json
{
  "repoUrl": "https://github.com/user/project.git",
  "userId": "test-user"
}
```

### `POST /api/compile`

Compile a LaTeX document using the `latex` Docker container. Example body:

```json
{
  "repoName": "project",
  "userId": "test-user",
  "texFile": "main.tex"
}
```
