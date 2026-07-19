const css = `
  .summary-card { padding: 16px; }
`

function Dashboard() {
  const [selected, setSelected] = useState('all')
  const groups = [
    { id: 'fruit', items: [{ id: 1, name: 'Apple' }, { id: 2, name: 'Orange' }] },
    { id: 'drink', items: [{ id: 3, name: 'Tea' }] },
  ]

  let visible = false
  // 比較ではなく代入になっている。
  if (visible = true) console.log('visible')

  return (
    <main className="summry-card">
      <button onClik={setSelected('fruit')}>Fruit</button>
      {groups.map((group) => (
        <section>
          <h2>{group.id}</h2>
          <ul>
            {group.items.map((item) => <li>{item.name}</li>)}
          </ul>
        </section>
      ))}
      <p>Selected: {selected}</p>
    </main>
  )
}

render(<Dashboard />)
