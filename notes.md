1. Why PostgreSQL over MySQL?
Better cloud support, stricter types, UUID native support, industry standard for new projects. MySQL knowledge transfers 90%

2. What is Next.js?
A framework built on top of React. Adds file-based routing, server-side rendering, and easier deployment. Learn plain React first, Next.js comes naturally after

3. Why do we need Express?
Node alone has no routing system. Express lets you define what happens when specific URLs are visited. Like a traffic controller for incoming requests

4. Why do we need CORS?
Browser security blocks requests between different origins (ports count). React on port 5173 talking to server on port 3000 gets blocked without CORS enabled

5. Why do we need dotenv?
Keeps sensitive config like database passwords out of your code. Values live in a .env file that never gets shared or uploaded to GitHub

6. What is the difference between development and production?
Development is you building and testing on your laptop. Production is the live app real users are using. Different tools and settings for each

7. What does --save-dev mean?
Marks a package as development-only. Tools like nodemon are excluded when deploying to production server. Like scaffolding on a building — useful while building, removed when done

8. What are npm scripts?
Shortcuts for commands defined in package.json. Instead of typing nodemon index.js you type npm run dev. Like preset buttons on a washing machine

9. What is PostgreSQL exactly — is it just a server?
Yes. It's software running as a background process on your computer, managing database files on disk, waiting for connections on port 5432. Like a warehouse manager who handles all filing for you

10. Why do we need Prisma?
Turns your database schema into type-safe JavaScript. VS Code can autocomplete and catch errors. Without it you write raw SQL strings with no safety net

11. Couldn't we just write SQL in DataGrip to create tables?
Yes but then you have no migration history. When moving to a server you'd have to remember every change ever made. Migrations solve this automatically

12. What did npx prisma init create?
Two things: a .env file with a DATABASE_URL template, and a prisma/schema.prisma file with the boilerplate datasource and generator config

13. What is an API?
A set of URLs your server exposes that the frontend talks to. Each URL does one specific thing. REST API uses HTTP methods (GET/POST/PUT/DELETE) to express intent

14. What are HTTP methods?
GET = read something, POST = create something new, PUT = update something existing, DELETE = remove something. They describe the intention of a request

15. What is async/await?
Database operations take time. async marks a function as containing time-based operations. await pauses execution until the database responds before moving to the next line

16. What is req.params?
Variables captured from the URL. In route /:id, when someone visits /abc-123, req.params.id equals abc-123

17. What is req.body?
The JSON data sent by the frontend in a POST or PUT request. express.json() middleware parses it into a usable JavaScript object

18. What are HTTP status codes?
Numbers that tell the frontend what happened. 200 = OK, 201 = created, 404 = not found, 500 = server error

19. Why put PrismaClient in its own file?
You should only create one database connection for the whole app. One file exports one instance, everything imports that same instance. Multiple instances exhaust PostgreSQL connection limits

20. What is a Router in Express?
A mini version of your app that handles routes for one section. Keeps code organized — operator routes in one file, machine routes in another, instead of everything in index.js

21. What is Insomnia?A tool for testing APIs. Lets you send GET/POST/PUT/DELETE requests with JSON data and see the response. Browsers can only send GET requests so you need this for testing

22. What burns Claude tokens fastest?Images (very expensive), pasting large code blocks repeatedly, long conversations. Use text for errors instead of screenshots, start fresh chats at milestones, keep your own notes

23. Does the terminal not saying anything when getting 500 error seem weird?
Yes — it meant errors were being swallowed silently in the catch block. Always add console.error to every catch block during development.

24. When updating, should all fields in PUT be optional?Yes. You never know if the frontend will send one field or all of them. Every PUT field should use the !== undefined pattern. 

25. Do you need a separate API endpoint just to deactivate a machine or operator?
No. The existing PUT handles it — just send active: false in the body.

26. "Can you explain include more?Without include Prisma returns only IDs. With include it fetches the full related record and nests it in the response. One level or multiple levels deep.