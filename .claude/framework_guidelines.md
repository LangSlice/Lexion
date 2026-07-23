# SolidJS Framework Guidelines & Best Practices

Follow these guidelines when writing SolidJS code for this project.
Documentation: [https://www.solidjs.com/docs/latest/api](https://www.solidjs.com/docs/latest/api)

## Reactivity & State Management

1.  **Use Signals for Local State:**
    - Prefer `createSignal` for component-local state.
    - Don't destructure signals in props unless you want to lose reactivity (pass the accessor function).

2.  **Use Stores for Complex/Shared State:**
    - Use `createStore` for nested data or global state (like `songStore`).
    - Mutate stores using the set function or produce (if using `produce` from `solid-js/store`).

3.  **Derived State (Memos):**
    - Use `createMemo` for expensive calculations derived from signals.
    - Don't use `createEffect` to update other signals (avoids waterfall updates).

4.  **Effects:**
    - Use `createEffect` mainly for side effects (logging, DOM manipulation, external APIs).
    - Wrap side-effects in `createRoot` if they are created outside a component setup function to ensure proper disposal/lifecycle management.

5.  **Control Flow:**
    - ALWAYS use `<Show>`, `<For>`, `<Switch>`, `<Match>` components instead of `array.map()` or ternary operators `condition ? true : false` in JSX for better performance and cleaner code.
    - `<For>` is keyed by reference; use `<Index>` for primitive values or when index stability is preferred.

## Component Structure

1.  **Props:**
    - Pass props as a single object.
    - Use `mergeProps` if you need default values.
    - Access props lazily (e.g., `props.value`) inside effects/JSX to maintain reactivity.

2.  **Clean Components:**
    - Keep components focused and small.
    - Extract complex logic into custom primitives (hooks) starting with `use...`.

3.  **Styling:**
    - Use Tailwind CSS utility classes directly in the `class` attribute.
    - Support Dark Mode (`dark:` variants) for all UI components.

## Common Pitfalls to Avoid

- **Destructuring Props:** `const { value } = props;` breaks reactivity. Always use `props.value`.
- **Reactivity in Async:** State updates in async functions are batched; be aware of timing.
- **Zombie Computations:** Ensure computations/effects are created inside a reactive root (component or `createRoot`).

## Project Specifics

- **Stores:** Global logic lives in `frontend/src/stores/`.
- **Routing:** Use `@solidjs/router` for navigation.
- **Icons:** Use `lucide-solid` for icons.

# Correctenss Validation

- Make use of terminal to validate linter or solidJS `ide diagnostics()` execution errors