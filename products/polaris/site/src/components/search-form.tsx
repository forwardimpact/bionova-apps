"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type Values = Record<string, string | boolean | string[] | undefined>;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function SearchForm({ initialValues = {} }: { initialValues?: Values }) {
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["condition", "phase", "status", "location"]) {
      const value = String(form.get(key) ?? "").trim();
      if (value) params.set(key, value);
    }
    router.push(`/search?${params.toString()}`);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="condition">Condition or plain-language search</Label>
        <Input
          id="condition"
          name="condition"
          placeholder="e.g. high blood sugar"
          defaultValue={str(initialValues.condition)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="phase">Phase</Label>
        <Input id="phase" name="phase" defaultValue={str(initialValues.phase)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="status">Status</Label>
        <Select
          id="status"
          name="status"
          defaultValue={str(initialValues.status)}
        >
          <option value="">Any</option>
          <option value="recruiting">Recruiting</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </Select>
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="location">Location</Label>
        <Input
          id="location"
          name="location"
          defaultValue={str(initialValues.location)}
        />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit">Search trials</Button>
      </div>
    </form>
  );
}
