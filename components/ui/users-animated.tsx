"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface UsersAnimatedIconProps {
  size?: number;
  className?: string;
}

const UsersAnimatedIcon = forwardRef<
  { startAnimation: () => void; stopAnimation: () => void },
  UsersAnimatedIconProps
>(({ size = 16, className }, ref) => {
  const [animated, setAnimated] = useState(false);

  useImperativeHandle(ref, () => ({
    startAnimation: () => setAnimated(true),
    stopAnimation: () => setAnimated(false),
  }));

  return (
    <Users
      size={size}
      className={cn(
        "transition-transform duration-300",
        animated && "scale-110",
        className
      )}
    />
  );
});

UsersAnimatedIcon.displayName = "UsersAnimatedIcon";

export { UsersAnimatedIcon };
