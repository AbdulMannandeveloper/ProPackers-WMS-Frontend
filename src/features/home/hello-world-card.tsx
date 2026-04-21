import { Button } from '@/components/ui/button'
import { useHomeStore } from '@/stores/home'

export function HelloWorldCard() {
  const { count, increment, decrement, clear } = useHomeStore()

  return (
    <div className="rounded-md border p-4 shadow-sm space-y-3">
      <h2 className="text-lg font-medium">Hello, world!</h2>
      <p className="text-sm text-muted-foreground">
        This is a simple demo card.
      </p>

      <div className="flex items-center gap-3">
        <span className="text-base">
          Count: <span className="font-semibold">{count}</span>
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={increment}>Increase</Button>
        <Button variant="secondary" onClick={decrement}>
          Decrease
        </Button>
        <Button variant="outline" onClick={clear}>
          Clear
        </Button>
      </div>
    </div>
  )
}
