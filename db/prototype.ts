import { eq } from "drizzle-orm";
import { dbClient, dbConn } from "@db/client.js";
import { taskTable, todoTable } from "@db/schema.js";

async function insertData() {
  await dbClient.insert(todoTable).values({
    todoText: "Finish reading",
  });
  dbConn.end();
}

async function queryData() {
  const results = await dbClient.query.todoTable.findMany();
  console.log(results);
  dbConn.end();
}

async function updateData() {
  const results = await dbClient.query.todoTable.findMany();
  if (results.length === 0) dbConn.end();

  const id = results[0].id;
  await dbClient
    .update(todoTable)
    .set({
      todoText: "AAA",
    })
    .where(eq(todoTable.id, id));
  dbConn.end();
}

async function deleteData() {
  const results = await dbClient.query.todoTable.findMany();
  if (results.length === 0) dbConn.end();

  const id = results[0].id;
  await dbClient.delete(todoTable).where(eq(todoTable.id, id));
  dbConn.end();
}

// new funciton prototypes
async function insertTaskData(todo_id:string) {
  await dbClient.insert(taskTable).values({
    taskText: `Task - ${new Date()}`,
    todoId: todo_id
  });
  dbConn.end();
}

async function queryWithTaskData() {
  const results = await dbClient.query.todoTable.findMany({
    with: { tasks: true}
  });
  console.log(results);
  dbConn.end();
}


// insertData();
// queryData();
// updateData();
// deleteData();

insertTaskData('3c7ad5bd-8b12-48a2-bc2f-eca58bc72e71');
// queryWithTaskData();
