# Basecamp – Project Management System
Node.js · Express · MySQL · JWT · React (Vite)

- Normalized MySQL schema, 8 tables (organizations, users, teams, team_members, projects, tasks, task_comments, task_status_history)
- Stateless JWT auth + RBAC (Admin / Manager / Member)
- 30 REST endpoints: tasks, deadlines, status transitions, teams, projects, users

## Prerequisites
Node.js 18+ and MySQL 8+ (running locally).

## 1. Backend
```bash
cd backend
npm install
# edit .env -> set DB_PASSWORD (and a JWT_SECRET)
npm run db:init     # creates DB, tables and demo data
npm run dev         # API on http://localhost:5000
```

## 2. Frontend (new terminal)
```bash
cd frontend
npm install
npm run dev         # http://localhost:5173
```

## Demo logins (password: `password123`)
| Role    | Email              |
|---------|--------------------|
| Admin   | admin@demo.com     |
| Manager | manager@demo.com   |
| Member  | member@demo.com    |

You can also register a brand-new organization from the login screen.

## Roles
- **Admin**: everything (users, roles, delete teams/projects)
- **Manager**: create/edit/assign/delete tasks, create projects, manage team members
- **Member**: sees own tasks, updates status of own tasks, comments

## Status transitions
`todo → in_progress → in_review → done` (can step back one stage; `done → in_progress` to reopen). Every change is logged in `task_status_history`.

## API summary (prefix `/api`)
| Area | Endpoints |
|------|-----------|
| Auth | POST /auth/register, POST /auth/login, GET /auth/me |
| Users | GET /users, POST /users, PATCH /users/:id/role, DELETE /users/:id |
| Teams | GET /teams, POST /teams, GET/PUT/DELETE /teams/:id, POST /teams/:id/members, DELETE /teams/:id/members/:userId |
| Projects | GET /projects, POST /projects, GET/PUT/DELETE /projects/:id |
| Tasks | GET /tasks (filters: status, projectId, assignedTo, priority), GET /tasks/overdue, POST /tasks, GET/PUT/DELETE /tasks/:id, PATCH /tasks/:id/status, PATCH /tasks/:id/assign, GET/POST /tasks/:id/comments |
| Dashboard | GET /dashboard/stats |

Send `Authorization: Bearer <token>` on all routes except register/login.
