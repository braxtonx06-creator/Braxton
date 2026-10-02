// Meal logging: snap a photo, the coach estimates the food (the meal-photo
// Edge Function), the user corrects it, and it's saved in the `meals` table.
// Photos live in the private meal-photos bucket under "<user id>/".

import { FunctionsHttpError } from "@supabase/supabase-js";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { localDate } from "@/lib/dates";
import { supabase } from "@/lib/supabase";

export type MealItem = {
  name: string;
  portion: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type MealEstimate = {
  title: string;
  items: MealItem[];
  confidence: "high" | "medium" | "low";
  note: string;
};

export type Meal = {
  id: string;
  day: string;
  title: string;
  items: MealItem[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  photo_path: string | null;
  created_at: string;
};

export type Totals = Pick<MealItem, "calories" | "protein_g" | "carbs_g" | "fat_g">;

const COLUMNS = "id, day, title, items, calories, protein_g, carbs_g, fat_g, photo_path, created_at";

async function userId() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Not signed in");
  return data.session.user.id;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function totalsOf(items: Totals[]): Totals {
  return items.reduce<Totals>(
    (t, i) => ({
      calories: t.calories + (Number(i.calories) || 0),
      protein_g: round1(t.protein_g + (Number(i.protein_g) || 0)),
      carbs_g: round1(t.carbs_g + (Number(i.carbs_g) || 0)),
      fat_g: round1(t.fat_g + (Number(i.fat_g) || 0)),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

// ---------- Photo ----------

// Opens the camera or the photo library. Returns null if the user cancels.
export async function pickPhoto(from: "camera" | "library"): Promise<ImagePicker.ImagePickerAsset | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.5, base64: true };
  if (from === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error("Camera access is off. Turn it on in Settings to snap meals.");
  }
  const result =
    from === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  return result.canceled ? null : (result.assets[0] ?? null);
}

function bytesFromBase64(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Uploads the photo to the user's folder and returns its storage path.
export async function uploadMealPhoto(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  if (!asset.base64) throw new Error("Couldn't read that photo");
  const type = asset.mimeType === "image/png" ? "image/png" : "image/jpeg";
  const path = `${await userId()}/${Date.now()}.${type === "image/png" ? "png" : "jpg"}`;
  const { error } = await supabase.storage
    .from("meal-photos")
    .upload(path, bytesFromBase64(asset.base64).buffer as ArrayBuffer, { contentType: type });
  if (error) throw error;
  return path;
}

// Asks the coach what's in the photo (takes ~10-15 seconds).
export async function estimateMeal(path: string, hint?: string): Promise<MealEstimate> {
  const { data, error } = await supabase.functions.invoke<MealEstimate>("meal-photo", { body: { path, hint } });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.error ?? error.message);
    }
    throw error;
  }
  if (!data) throw new Error("The coach returned nothing");
  return data;
}

export async function removeMealPhoto(path: string) {
  await supabase.storage.from("meal-photos").remove([path]);
}

// ---------- Meals ----------

export async function saveMeal(meal: { title: string; items: MealItem[]; photo_path: string | null }) {
  const totals = totalsOf(meal.items);
  const { error } = await supabase.from("meals").insert({
    user_id: await userId(),
    day: localDate(),
    title: meal.title.trim() || "Meal",
    items: meal.items,
    calories: Math.round(totals.calories),
    protein_g: totals.protein_g,
    carbs_g: totals.carbs_g,
    fat_g: totals.fat_g,
    photo_path: meal.photo_path,
  });
  if (error) throw error;
}

export async function deleteMeal(meal: Meal) {
  const { error } = await supabase.from("meals").delete().eq("id", meal.id);
  if (error) throw error;
  if (meal.photo_path) await removeMealPhoto(meal.photo_path);
}

export async function loadMeals(day = localDate()): Promise<Meal[]> {
  const { data, error } = await supabase
    .from("meals")
    .select(COLUMNS)
    .eq("day", day)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((m) => ({
    ...m,
    protein_g: Number(m.protein_g),
    carbs_g: Number(m.carbs_g),
    fat_g: Number(m.fat_g),
  })) as Meal[];
}

// Today's meals, reloaded each time the screen comes into view. null until loaded.
export function useTodayMeals() {
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setError(null);
    loadMeals()
      .then(setMeals)
      .catch((e: Error) => setError(e.message));
  }, []);

  useFocusEffect(reload);

  return { meals, error, reload };
}

// A short-lived link to show a private meal photo.
export async function mealPhotoUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("meal-photos").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}
