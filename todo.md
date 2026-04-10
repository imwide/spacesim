Make asteroids higher poly. Keep the current poly for a further a way LOD but on a closer scale they should look more defined. The smaller ones only need to be a bit higher poly but the bigger ones should not only be higher poly but also have more abstract shapes. The current ones just look like stretched spheres.



Lets overhaul the ship models:
1. There will be multiple kinds of ships. For now I have only provided one (aether.glb) Aether will be the default and starter spaceship.
2. Ships should be rendered in two layers, that are never visible at the same time: Outside layer (visible when the player is outside of the ship) and inside layer (visible when the player is inside the ship, only displays the insides of the ship, the rooms and co).
3. For each ship that we will have, there will be a config file that specifies the following things:
- The name of the ship
- The path to the ship outside model (glb)
- The path to the ship inside model (glb)
These are relative coordinates to the ships position:
- The "entry point" of the ship, which is the position where the player can enter the ship in (in a radius of 10m, practically serving as a door position)
- The "exit point" of the ship, which is the position where the player can exit the ship in (in a radius of 10m, practically serving as a door position)
- The inside spawn point, which is the position where the player will spawn when they enter the ship
- The outside spawn point, which is the position where the player will spawn when they exit the ship
- The "pilot seat position", which is the position of the pilot seat in the inside model, this will be used to determine where the pilot seat is and where they can sit in the pilot seat.
- Multipliers for acceleration, speed, turning speed, etc.
- Camera orbit radius (in meters), which is the radius at which the camera will orbit around the ship when the player is piloting it.

