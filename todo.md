Make asteroids higher poly. Keep the current poly for a further a way LOD but on a closer scale they should look more defined. The smaller ones only need to be a bit higher poly but the bigger ones should not only be higher poly but also have more abstract shapes. The current ones just look like stretched spheres.

Make asteroid groups also spawn around planets just like moons.


Make it possible for planets to have a saturn like asteroid belt around it. Add this to the config of 2 planets already for testing. Add parameters like the starting radius and end radius and the rotation of the ring. The ring/belt should at least from a distance simply be a semi-transparent texture. When getting close enough to a part of the belt, this part should radally around the distance from the camera fade out smoothly. This should happen at 500km. The faded out part should be replaced by 2d billboard sprites that are also semi transparent and have the same color as the ring texture in that position. Eventhough they are semi transparent, them overlapping should not add the color. Getting closer than 50km should spawn actual 3d asteroids just like in the current asteroid groups. The other levels of detail of the belt such as the texture and the billboards should still be visible. To not run into performance issues, introduce frustum culling and introduce your own performance optimizations.
These single asteroids should obviously not exist as destinations for autopilot.

Improve the "hyperspeed effect" to not be a 2d visual effect ontop of the camera, but to be a "real" 3d effect with applied postprocessing thats physically around the ship (around 500m distance) and oriented the right way.

The turning can happen really fast right now. The intensity that the turn and rotation of the ship is started at is really high. it should "fade in" and slowly start turning as it is has a lot of weight

While flying the ship (in the pilot seat) allow for switching perspectives. Currently its only third person perspective where the camera orbits around the ship. When pressing a hotkey for swithcing perspectives, it toggles between third person and first person perspective. In first person perspective, the camera should be fixed in place but not rotation, 1m above the ships "pilot seat" position. The ship inside should be rendered again isntead of the outside. The controls should be identical.

Ship collisions with stations and asteroids need to work

Ship landing in stations needs to work

Add light nodes to the station models. This will allow every station to have a array of relative coordinates (that will also be shown with the debug crosshairs)

Modify velocity limiters around stations to be less strict, smaller and not apply when outside of the "outermost boundry" sphere of the station and when facing more than 120° away from the station.

Fix station safe zone shooting glitch: when the ship's center is still outside of the station's safe zone but one of the ships guns is already inside, the projectiles will fly inside the safe zone and be able to hit targets. Fix this by not firing any guns inside of safe zones aswell as not allowing projectiles to fly inside of safe zones.

Turning collision detector

The highlight tag highlighting an autopilot target currently doesnt clear when the autopilot is disengaged. This is fine, but there should always only be one highlighted tag at a time and no matter what is currently highlighted, under the "disengage autopilot" button in the navigator UI, also add the option to clear the highlighted tag, if there is one, and if its not there because of the autopilot

Ship backwards flying


BLENDER TODO: decrease glow intensity, apply array, screw stickers dont work/have no outline.


Edge shader triangle collapse: prefer straight edges/aligned with axes edges

Player height is too tall inside the ship. I used a reference in blender that was the same apparent height of 1.7m and its eyelevel was lower than the one in the game.




When disengaging autopilot at any speed, keep momentum, but as long as the ship is faster than its normal max speed, apply deceleration so that it would be stationary within 20 seconds multiplied by the ships braking multiplier

Add targeting option in the navigator UI which will always make the ship point to the target.

Make ship slowly turn horizontal while no user input

-2.79638

-7.28286

if any mesh inside a glb file has the word "organic" in its name, the "blender" like edge shader should not be applied but instead the old outline shader should be applied. Also rename this old outline shader to the "organic outline shader" and the blender like edge shader to the "geometric edge shader".