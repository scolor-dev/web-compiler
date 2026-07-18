function StatusCard({ ready }) {
  return (
    <section>
      <h1>Build status</h1>
      <p>{ready ? 'Ready to ship' : 'Still working'}</p>
    </section>
  )
}

render(<StatusCard ready />)
