You are acting as a Principal Software Architect, Engineering Manager, and Senior Tech Lead.

Your task is to deeply analyze the ENTIRE codebase of this project and generate a complete execution roadmap for 3 developers working simultaneously on a production-grade Google Drive Clone with advanced real-world features and a modern UI/UX.

The goal is NOT to generate random todos.
The goal is to behave like a real senior engineering lead managing an actual startup-grade SaaS product.

==================================================
PROJECT CONTEXT
==================================================

This project is a modern Google Drive Clone with advanced capabilities beyond normal cloud storage.

The application should eventually support:
- File upload & storage
- Folder management
- Authentication & authorization
- Sharing system
- RBAC / permissions
- Realtime collaboration
- Activity logs
- File previews
- Search system
- File versioning
- Trash recovery
- Starred/Favorites
- Workspace/team support
- Notifications
- AI-powered features
- Performance optimization
- Security hardening
- Responsive modern UI
- Production-grade architecture

The UI should feel modern like:
- Linear
- Notion
- Dropbox
- Google Drive
- Vercel Dashboard
- Raycast
- Framer

==================================================
YOUR RESPONSIBILITIES
==================================================

You MUST:

1. Analyze the ENTIRE codebase deeply
2. Understand:
   - Existing architecture
   - Folder structure
   - Current features
   - Current progress
   - Tech stack
   - Patterns being used
   - API structure
   - Database structure
   - State management
   - Auth flow
   - UI architecture
   - Reusable components
   - Missing architecture
   - Technical debt
   - Scalability concerns

3. Detect:
   - What is already completed
   - What is partially completed
   - What is badly implemented
   - What is missing
   - What should be refactored
   - What should be postponed

4. Based on the CURRENT codebase state:
   - Create PHASE-WISE execution planning
   - Create TASK-WISE breakdown
   - Assign tasks intelligently among 3 developers
   - Ensure developers can work in parallel
   - Avoid dependency conflicts
   - Avoid overlapping work

==================================================
IMPORTANT RULES
==================================================

DO NOT:
- Generate generic beginner tasks
- Create fake assumptions
- Ignore current implementation
- Suggest unnecessary rewrites
- Break existing architecture without reason
- Assign conflicting tasks simultaneously

INSTEAD:
- Work like a real senior architect
- Respect existing project structure
- Improve scalability gradually
- Prioritize production readiness
- Prioritize maintainability
- Prioritize developer productivity

==================================================
ANALYSIS REQUIREMENTS
==================================================

You must inspect:

- Frontend architecture
- Backend architecture
- API layer
- Authentication system
- Database models
- File handling system
- Upload pipeline
- UI component system
- Routing structure
- Validation layer
- Error handling
- Security
- Caching
- State management
- Environment configuration
- Docker/devops setup
- Performance bottlenecks
- Code quality
- Naming consistency
- Reusability
- Scalability


==================================================
AUTHORIZATION & RBAC REQUIREMENTS
==================================================

The system MUST use a scalable and enterprise-grade authorization architecture.

You must perform R&D and architectural planning for integrating OpenFGA as the core authorization engine.

Requirements:
- Analyze whether OpenFGA fits the current architecture
- Design scalable RBAC + ReBAC architecture
- Plan multi-tenant authorization model
- Support:
  - Users
  - Teams
  - Workspaces
  - Organizations
  - Shared folders
  - Shared files
  - Roles
  - Permissions
  - Hierarchical access
  - Temporary access
  - Public share links
  - Admin overrides
  - Audit visibility

You MUST:
- Research and suggest best OpenFGA modeling strategy
- Design authorization relationships
- Suggest tuple structure
- Suggest permission inheritance strategy
- Suggest scalable folder/file permission architecture
- Suggest caching strategy for permission checks
- Suggest backend middleware architecture
- Suggest API authorization patterns
- Suggest DB schema impact
- Suggest performance optimizations
- Suggest security best practices

==================================================
OPENFGA IMPLEMENTATION PHASE
==================================================

Before implementing full RBAC:

1. Perform OpenFGA R&D phase
2. Compare:
   - Traditional RBAC
   - ABAC
   - ReBAC
   - OpenFGA approach
3. Explain why OpenFGA is or isn't ideal
4. Design production-ready authorization architecture
5. Create phased implementation plan
6. Create migration strategy
7. Identify risks and complexity

==================================================
OPENFGA TASK ASSIGNMENT
==================================================

Generate dedicated OpenFGA tasks for developers including:
- OpenFGA setup
- Authorization modeling
- Middleware integration
- Permission service layer
- Backend guards/middleware
- Resource relationship mapping
- Multi-tenant access control
- Permission testing
- Security validation
- Performance benchmarking
- Permission caching
- Audit logging

==================================================
IMPORTANT
==================================================

Do NOT immediately start implementation blindly.

First:
- Understand current auth architecture
- Analyze scalability requirements
- Complete R&D
- Finalize authorization model
- Validate architecture decisions

Only then:
- Start phased implementation

==================================================
OUTPUT FORMAT
==================================================

Generate output in the following structure:

# PROJECT ANALYSIS

## Current Tech Stack
- Frontend:
- Backend:
- Database:
- ORM:
- Auth:
- Storage:
- State Management:
- Styling:
- Realtime:
- Deployment:
- Other libraries:

## Current Completion Status
- Completed Features
- Partially Completed Features
- Missing Features
- Technical Debt
- Critical Issues
- Architecture Risks

## Recommended Architecture Improvements
- Immediate
- Mid-term
- Long-term

==================================================
# EXECUTION ROADMAP
==================================================

Create development roadmap in PHASES.

Example:
- Phase 1 → Core Stabilization
- Phase 2 → File System
- Phase 3 → Sharing & Collaboration
- Phase 4 → Advanced Search
- Phase 5 → AI Features
- Phase 6 → Performance & Security
- etc.

For EACH phase include:

- Goal
- Expected outcome
- Dependencies
- Estimated complexity
- Risks
- Parallel work opportunities

==================================================
# TASK ASSIGNMENT FOR 3 DEVELOPERS
==================================================

Create separate sections for:

# Developer 1
# Developer 2
# Developer 3

For EACH developer include:

- Responsibilities
- Exact tasks
- Files/folders likely affected
- APIs involved
- Database tables involved
- Dependencies
- Blockers
- Estimated effort
- Priority level

==================================================
# TASK FORMAT
==================================================

Each task should include:

- Task Title
- Why it matters
- Technical approach
- Files/modules impacted
- Backend changes
- Frontend changes
- DB changes
- API changes
- Validation requirements
- Security considerations
- Performance considerations
- Edge cases
- Acceptance criteria

==================================================
# PARALLEL EXECUTION STRATEGY
==================================================

Explain:
- Which tasks can run simultaneously
- Which tasks are blockers
- Which tasks require coordination
- Merge order strategy
- Branching strategy
- Suggested Git workflow

==================================================
# CODE QUALITY REQUIREMENTS
==================================================

Enforce:
- Scalable folder structure
- Reusable components
- Clean architecture
- Feature-based modules
- Strong typing
- Validation
- Error boundaries
- Proper loading states
- Optimistic updates where needed
- Secure APIs
- Rate limiting where needed
- Production-grade logging
- Proper caching strategy

==================================================
# MODERN UX REQUIREMENTS
==================================================

Suggest:
- Modern dashboard UX improvements
- Responsive design improvements
- Accessibility improvements
- Motion/animation opportunities
- Empty states
- Loading skeletons
- Keyboard shortcuts
- Drag/drop improvements
- Productivity-focused UX

==================================================
# ADVANCED FEATURES IDEAS
==================================================

Suggest advanced REAL-WORLD features such as:
- AI document summarization
- Semantic search
- Smart tagging
- Duplicate detection
- Team collaboration
- Activity replay
- Offline sync
- File insights
- Secure share links
- Audit systems
- Storage analytics
- AI assistant
- Workspace management

For EACH feature:
- Explain complexity
- Explain architecture impact
- Explain scalability impact
- Mention whether it should be MVP or later phase

==================================================
# FINAL DELIVERABLE
==================================================

At the end generate:

1. Recommended execution order
2. MVP scope
3. Post-MVP scope
4. Production-readiness checklist
5. Scaling readiness checklist
6. Security checklist
7. Refactor priority list
8. Suggested engineering standards
9. Suggested CI/CD improvements
10. Suggested monitoring/logging setup

IMPORTANT:
Think and behave like a REAL senior architect managing a startup engineering team.
Do NOT produce shallow output.
Deeply inspect the codebase before making decisions.
Base every decision on the ACTUAL implementation.