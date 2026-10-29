// Exact copy blocks from the supplied prompts; older example caps are not product settings.
export const BRING_WORK_PROMPT =
  'I want to write down how I do my work, so my team can see it and help with it.\n\nLook at our past conversations about my work. Find the tasks I do again and again. For each task, describe how I usually do it.\n\nRules:\n- Use only what you can see in our past conversations, or what I tell you now. Do not guess.\n- If you do not know a field, write "Not stated".\n- Do not include passwords, keys, customer names, personal data or private numbers. Write "[removed]" in their place.\n- Use short sentences. Use one instruction in each step. Use the active voice.\n- If you cannot see my past conversations, tell me. Then ask me about my tasks one at a time, and fill in the format from my answers.\n\nGive me one block for each task, in this exact format. Keep the headings exactly as written.\n\n# Task: <short name, a verb first, for example "Write the weekly sales summary">\n\n## Part of my job\n<the duty or area of my role this task belongs to>\n\n## Starts when\n<what starts the task, for example "every Monday" or "a customer emails a complaint">\n\n## How often and how long\n<for example "weekly, about 2 hours">\n\n## Inputs\n- <each thing I need, and where it comes from>\n\n## Steps\n1. <first step>\n2. <next step>\n\n## Output\n<what the task makes, and what "done" means>\n\n## Hand off to\n<the person, team or system that gets the output. Write "Not stated" if you do not know.>\n\n## Software\n- <each app or system I use>\n\n## Approvals and rules\n- <who must approve, and anything I must not do>\n\n## AI I already use\n<the prompts, custom GPTs, Claude Projects, skills or tools I use for this task. Copy any prompt I reuse in full, inside a code block.>\n\n## Sources\n<the dates or titles of the conversations you used>\n\nAfter the last task, add a list with the title "Tasks I could not describe". Put there any task you saw but did not have enough detail for.';
export const EARN_PROMPTS = [
  {
    title: "Find tasks only I know",
    text: "I want to find the tasks at work that only I know how to do, or that I do best.\nAsk me questions, one at a time. Ask about:\n- what I do every day, every week, every month and every year;\n- what people ask me for help with;\n- what would go wrong if I was away for two weeks;\n- work I do with my hands, not only on a computer.\nAfter 10 questions, give me a list of up to 10 tasks. Put a verb first in each name. Mark the ones that nobody else knows.",
  },
  {
    title: "Write down a hands-on task, step by step",
    text: 'Help me write down one task that I do by hand, so that a new person can do it alone on their first day.\nThe task is: <name the task>.\nInterview me. Ask one question at a time. Ask about each step in order:\n- where I go, and how I get there;\n- which tool or part I use, and exactly where it is kept (room, shelf, drawer, bin);\n- what I check, and how I know it is correct;\n- what can go wrong, and what I do then;\n- what safety rules apply;\n- who I tell when I am done.\nKeep asking "And then what?" until I say the task is done.\nDo not guess. If I do not know something, write "Not stated".\nThen write the task in this exact format:\n\n# Task: <verb first>\n## Part of my job\n## Starts when\n## How often and how long\n## Inputs\n## Steps\n1. <one action in each step, with the place and the tool>\n## Output\n## Hand off to\n## Software\n## Approvals and rules\n## Safety\n## Where things are\n- <item>: <exact place>\n## Only I know\n<what a new person would not find out alone>\n\nUse short sentences. Use one instruction in each step. Use the active voice.',
  },
  {
    title: "Check my card before I send it",
    text: "Read this Task Card as if you are a new person on your first day.\nList every place where you would get stuck or need to ask someone.\nThen ask me one question for each place, and update the card with my answers.\n\n<paste the card here>",
  },
] as const;
export const FIND_MORE_QUESTIONS = [
  "Walk me through your day, from when you arrive to when you leave.",
  "What do you do once a month, a quarter or a year that you would forget to tell a new person?",
  "What do you do with your hands? Where do you get each tool or part: which room, shelf, drawer, truck or cabinet?",
  "What do people come to you for?",
  "What goes wrong, and what do you do then?",
  "What would stop if you were out for two weeks?",
  "Who do you hand things to, in person?",
] as const;
