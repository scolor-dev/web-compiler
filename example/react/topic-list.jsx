function TopicList() {
  const topics = ['JSX', 'Components', 'Hooks']
  return (
    <main>
      <h1>React topics</h1>
      <ul>{topics.map((topic) => <li key={topic}>{topic}</li>)}</ul>
    </main>
  )
}

render(<TopicList />)
