import { useState } from "react";
import { Icon } from "./icons.tsx";
import { overlay } from "./overlay.ts";
import { text } from "./text.ts";

export function Capture() {
  const [value, setValue] = useState("");
  return (
    <form
      className="capture"
      onSubmit={(event) => {
        event.preventDefault();
        overlay.openAdd(value.trim());
        setValue("");
      }}
    >
      <label className="visually-hidden" htmlFor="capture">
        {text.capture.label}
      </label>
      <Icon name="plus" />
      <input
        id="capture"
        value={value}
        maxLength={500}
        autoComplete="off"
        autoCapitalize="sentences"
        enterKeyHint="go"
        placeholder={text.capture.placeholder}
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit" aria-label={text.capture.review}>
        {text.capture.go}
      </button>
    </form>
  );
}
