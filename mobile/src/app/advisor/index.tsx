import { Redirect, type Href } from "expo-router";
export default function AdvisorIndex() {
  return <Redirect href={"/advisor/meetings" as Href} />;
}
