# RPM System - Rapid Planning Method

A comprehensive productivity system inspired by Tony Robbins' RPM (Rapid Planning Method) methodology. Built with React, Node.js, PostgreSQL, and Docker.

## Features

- **Categories**: Organize your life into major focus areas (3 to Thrive, Juice of Life, Financial Freedom, etc.)
- **Projects**: Create projects within categories with ultimate results and purposes
- **Actions**: Track individual tasks with duration, dates, and leverage persons
- **RPM Blocks**: Group actions into Result-Purpose-Massive Action Plan blocks
- **Key Results**: Set measurable outcomes for projects
- **Capture List**: Quick capture for ideas and tasks
- **Calendar/Planner**: Visual planning and scheduling
- **People**: Track accountability partners and leverage persons

## Tech Stack

- **Frontend**: React 18, React Router, Lucide Icons, date-fns
- **Backend**: Node.js, Express
- **Database**: PostgreSQL 15
- **Containerization**: Docker, Docker Compose

## Quick Start with Docker

1. **Clone or extract the project**:
   ```bash
   unzip rpm-system.zip
   cd rpm-system
   ```

2. **Start all services**:
   ```bash
   docker-compose up -d
   ```

3. **Access the application**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001
   - Database: localhost:5432

4. **Stop services**:
   ```bash
   docker-compose down
   ```

## Development Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- npm or yarn

### Backend Setup

```bash
cd backend
npm install

# Create .env file
echo "DATABASE_URL=postgresql://rpm_user:rpm_secure_password_2024@localhost:5432/rpm_database
PORT=3001" > .env

# Start development server
npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### Database Setup

1. Create the database:
   ```sql
   CREATE DATABASE rpm_database;
   CREATE USER rpm_user WITH PASSWORD 'rpm_secure_password_2024';
   GRANT ALL PRIVILEGES ON DATABASE rpm_database TO rpm_user;
   ```

2. Run the initialization script:
   ```bash
   psql -U rpm_user -d rpm_database -f database/init.sql
   ```

## Project Structure

```
rpm-system/
├── docker-compose.yml       # Docker orchestration
├── frontend/                # React frontend
│   ├── src/
│   │   ├── components/      # Reusable components
│   │   │   └── modals/      # Modal components
│   │   ├── pages/           # Page components
│   │   ├── App.jsx          # Main app with routing
│   │   ├── index.css        # Global styles
│   │   └── main.jsx         # Entry point
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── backend/                 # Node.js API
│   ├── src/
│   │   └── index.js         # Express server & routes
│   ├── Dockerfile
│   └── package.json
└── database/
    └── init.sql             # PostgreSQL schema & seed data
```

## API Endpoints

### Categories
- `GET /api/categories` - List all categories
- `GET /api/categories/:id` - Get category with details
- `POST /api/categories` - Create category
- `PUT /api/categories/:id` - Update category
- `PUT /api/categories/:id/details` - Update big picture details
- `DELETE /api/categories/:id` - Delete category

### Projects
- `GET /api/projects` - List projects (filter by category_id)
- `GET /api/projects/:id` - Get project with all data
- `POST /api/projects` - Create project
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Actions
- `GET /api/actions` - List actions (filter by category/project/block)
- `GET /api/actions/:id` - Get action
- `POST /api/actions` - Create action
- `PUT /api/actions/:id` - Update action
- `POST /api/actions/:id/duplicate` - Duplicate action
- `DELETE /api/actions/:id` - Delete action

### RPM Blocks
- `GET /api/blocks` - List blocks
- `GET /api/blocks/:id` - Get block with actions
- `POST /api/blocks` - Create block
- `PUT /api/blocks/:id` - Update block
- `DELETE /api/blocks/:id` - Delete block

### Key Results
- `GET /api/projects/:projectId/key-results` - List key results
- `POST /api/key-results` - Create key result
- `PUT /api/key-results/:id` - Update key result
- `DELETE /api/key-results/:id` - Delete key result

### Capture Items
- `GET /api/capture-items` - List capture items
- `POST /api/capture-items` - Create capture item
- `PUT /api/capture-items/:id` - Update capture item
- `DELETE /api/capture-items/:id` - Delete capture item

### Persons
- `GET /api/persons` - List all persons
- `POST /api/persons` - Create person
- `PUT /api/persons/:id` - Update person
- `DELETE /api/persons/:id` - Delete person

### Calendar
- `GET /api/planner?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` - Get scheduled actions

## Database Schema

The database includes:
- `categories` - Life categories
- `category_details` - Big picture content (vision, roles, goals)
- `projects` - Projects within categories
- `actions` - Individual tasks
- `rpm_blocks` - RPM planning blocks
- `key_results` - Measurable outcomes
- `capture_items` - Quick capture list
- `inspiration_items` - Inspiration board items
- `persons` - Accountability partners
- `leverage_requests` - Leverage/commit requests

## Environment Variables

### Backend
- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - Server port (default: 3001)
- `NODE_ENV` - Environment (development/production)

## Customization

### Adding New Categories
Categories can be added via:
1. The "Create" button → Category option in the UI
2. Directly in the database
3. Modifying the seed data in `database/init.sql`

### Styling
The dark theme and styling can be customized in `frontend/src/index.css`. CSS variables are used for easy theming.

## License

MIT License - Feel free to use and modify for your own productivity needs!

## Acknowledgments

Inspired by Tony Robbins' Rapid Planning Method (RPM) - a results-focused approach to planning that emphasizes outcome clarity and emotional purpose.

## Missions (Agents page)

A task in plain words -> a tool-less planner run (job `mission-plan`, executed by the owner's local runner) -> a plan
`{summary, steps:[{key, capability, inputs, why, depends_on}]}` (max 8 steps, acyclic, validated against
`backend/src/missionCapabilities.js`) -> the owner approves -> one queued run per step, claimed by the runner only when
every `depends_on` step is `done` and the apps it needs are connected.

- Tables: `biz_agent_missions`; `biz_agent_runs` gets `mission_id, step_key, depends_on, capability`; `biz_agent_runner.apps`.
  Migration `database/migrations/2026-10-09-missions.sql` (idempotent; also in `init.sql`).
- Endpoints (`/api/business/missions`, browser session): `GET /capabilities`, `GET /`, `POST /` `{text}` (5-2000 chars),
  `GET /:id`, `POST /:id/approve` `{steps:[{key, confirmed?}]}` (409 if a step needs an app that is not connected, or a
  paid / outward-reading step is not confirmed), `POST /:id/cancel`.
- Runner (write-scope token only): `POST /agent-runs/heartbeat {runner, apps}`; `claim` also takes `apps` and `busy_apps`.
- A failed or cancelled dependency fails the queued steps behind it ("Skipped") and the mission rolls up from its steps.
- Tests: `node --test test/*.test.js` (`test/missions.test.js`, shared fake pool in `test/fakePool.js`).
